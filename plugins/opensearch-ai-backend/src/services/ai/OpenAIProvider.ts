import OpenAI from 'openai';
import type { AiProvider, RewriteInput, RewriteOutput } from './AiProvider';
import { ErrorHandler, CircuitBreaker } from '../ErrorHandler';
import type { CacheService } from '../CacheService';

export class OpenAIProvider implements AiProvider {
  private openai: OpenAI;
  private circuitBreaker: CircuitBreaker;

  constructor(
    private readonly options: {
      model: string;
      apiKey?: string;
      endpoint?: string; // supports Azure/OpenAI custom endpoints in future
      temperature?: number;
      synonyms?: Record<string, string[]>; // config-driven synonyms
    },
    private readonly cache?: CacheService,
  ) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.endpoint,
    });

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      monitoringPeriodMs: 10000, // 10 seconds
    });
  }

  async rewrite(input: RewriteInput): Promise<RewriteOutput> {
    // Check cache first
    if (this.cache) {
      const cacheKey = `rewrite:${JSON.stringify({ query: input.query, filters: input.filters })}`;
      const cached = this.cache.get<RewriteOutput>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await this.circuitBreaker.execute(async () => {
      return await this.performRewrite(input);
    });

    // Cache the result
    if (this.cache) {
      const cacheKey = `rewrite:${JSON.stringify({ query: input.query, filters: input.filters })}`;
      this.cache.set(cacheKey, result, 300); // Cache for 5 minutes
    }

    return result;
  }

  private async performRewrite(input: RewriteInput): Promise<RewriteOutput> {
    // First, apply basic heuristics as fallback
    const fallbackResult = this.getFallbackRewrite(input.query);

    try {
      // Use OpenAI to enhance the rewrite
      const aiResult = await ErrorHandler.withRetry(
        async () => {
          const completion = await this.openai.chat.completions.create({
            model: this.options.model,
            temperature: this.options.temperature ?? 0.3,
            max_tokens: 500,
            messages: [
              {
                role: 'system',
                content: this.getSystemPrompt(),
              },
              {
                role: 'user',
                content: this.getUserPrompt(input.query, input.filters),
              },
            ],
          });

          return this.parseAIResponse(completion.choices[0]?.message?.content || '');
        },
        {
          retries: 2,
          minTimeout: 1000,
          maxTimeout: 3000,
        },
        'OpenAI query rewrite',
      );

      // Merge AI result with fallback, preferring AI enhancements
      return this.mergeResults(fallbackResult, aiResult);
    } catch (error) {
      console.warn('OpenAI rewrite failed, using fallback:', error);
      return fallbackResult;
    }
  }

  private getSystemPrompt(): string {
    return `You are a search query optimizer for a Backstage developer portal. Your task is to analyze user queries and improve them for better search results.

Context: Users search for documentation, APIs, services, teams, and runbooks in their organization.

Your response must be a JSON object with these fields:
- "query": The optimized search query (clean, normalized)
- "intent": Array of detected intents (e.g., ["how-to", "api", "incident", "owner", "policy"])
- "expanded": Array of additional search terms and synonyms
- "boosts": Object with "sources" and "tags" arrays for result boosting
- "filters": Object with key-value arrays for filtering results

Example response:
{
  "query": "deploy kubernetes service",
  "intent": ["how-to"],
  "expanded": ["deployment", "k8s", "container", "orchestration"],
  "boosts": {"sources": ["techdocs"], "tags": ["deployment"]},
  "filters": {}
}

Focus on:
1. Normalizing the query (fix typos, expand abbreviations)
2. Detecting user intent (what they're looking for)
3. Adding relevant synonyms and related terms
4. Suggesting appropriate result boosts
5. Being conservative with filters to avoid hiding results`;
  }

  private getUserPrompt(query: string, filters?: Record<string, unknown>): string {
    let prompt = `Analyze and optimize this search query: "${query}"`;
    
    if (filters && Object.keys(filters).length > 0) {
      prompt += `\nExisting filters: ${JSON.stringify(filters)}`;
    }

    return prompt;
  }

  private parseAIResponse(content: string): Partial<RewriteOutput> {
    try {
      const parsed = JSON.parse(content);
      return {
        query: parsed.query || undefined,
        intent: Array.isArray(parsed.intent) ? parsed.intent : undefined,
        expanded: Array.isArray(parsed.expanded) ? parsed.expanded : undefined,
        boosts: parsed.boosts || undefined,
        filters: parsed.filters || undefined,
      };
    } catch (error) {
      console.warn('Failed to parse AI response:', error);
      return {};
    }
  }

  private getFallbackRewrite(query: string): RewriteOutput {
    const q = query.trim().replace(/\s+/g, ' ');
    const intent = this.guessIntent(q);
    const expanded = this.expandSynonyms(q, intent);
    const boosts = this.intentBoosts(intent);
    const filters = this.intentFilters(intent);
    return { query: q, intent, expanded, boosts, filters };
  }

  private mergeResults(fallback: RewriteOutput, ai: Partial<RewriteOutput>): RewriteOutput {
    return {
      query: ai.query || fallback.query,
      intent: ai.intent || fallback.intent,
      expanded: [
        ...(ai.expanded || []),
        ...(fallback.expanded || []),
      ].filter((term, index, arr) => arr.indexOf(term) === index), // Remove duplicates
      boosts: {
        sources: [
          ...(ai.boosts?.sources || []),
          ...(fallback.boosts?.sources || []),
        ].filter((src, index, arr) => arr.indexOf(src) === index),
        tags: [
          ...(ai.boosts?.tags || []),
          ...(fallback.boosts?.tags || []),
        ].filter((tag, index, arr) => arr.indexOf(tag) === index),
      },
      filters: {
        ...fallback.filters,
        ...ai.filters,
      },
    };
  }

  private guessIntent(q: string): string[] {
    const l = q.toLowerCase();
    const intents: string[] = [];
    if (/how\s+to|how do i|guide|tutorial/.test(l)) intents.push('how-to');
    if (/incident|runbook|on[- ]?call|pagerduty|sev\d/.test(l)) intents.push('incident');
    if (/owner|team|contact/.test(l)) intents.push('owner');
    if (/api|openapi|swagger/.test(l)) intents.push('api');
    if (/policy|security|compliance/.test(l)) intents.push('policy');
    return intents;
  }

  private expandSynonyms(q: string, intent: string[]): string[] {
    const base: Record<string, string[]> = {
      api: ['openapi', 'swagger', 'rest', 'endpoint', 'spec'],
      howto: ['guide', 'tutorial', 'how-to'],
      incident: ['runbook', 'incident', 'oncall', 'pagerduty'],
      owner: ['owner', 'maintainer', 'team', 'contact'],
      policy: ['policy', 'security', 'compliance', 'standard'],
    };
    const configured = this.options.synonyms ?? {};
    for (const [k, v] of Object.entries(configured)) {
      base[k] = Array.from(new Set([...(base[k] ?? []), ...v]));
    }
    const terms: string[] = [];
    if (intent.includes('api')) terms.push(...base.api);
    if (intent.includes('how-to')) terms.push(...base.howto);
    if (intent.includes('incident')) terms.push(...base.incident);
    if (intent.includes('owner')) terms.push(...base.owner);
    if (intent.includes('policy')) terms.push(...base.policy);
    // Avoid echoing original query words as expansions
    const original = new Set(q.toLowerCase().split(/\s+/));
    return Array.from(new Set(terms.filter(t => !original.has(t))));
  }

  private intentBoosts(intent: string[]): RewriteOutput['boosts'] {
    const sources: string[] = [];
    const tags: string[] = [];
    if (intent.includes('how-to')) sources.push('techdocs');
    if (intent.includes('incident')) tags.push('runbook');
    if (intent.includes('api')) sources.push('apis');
    return { sources: Array.from(new Set(sources)), tags: Array.from(new Set(tags)) };
  }

  private intentFilters(intent: string[]): RewriteOutput['filters'] {
    const filters: Record<string, (string | number | boolean)[]> = {};
    // Keep filters light to avoid hiding results; can be tightened later.
    if (intent.includes('owner')) {
      // Prefer components and systems where owner is present
      filters['kind'] = ['Component', 'System'];
    }
    return filters;
  }

  async health(): Promise<boolean> {
    try {
      // Test the connection with a minimal request
      await this.openai.models.list();
      return true;
    } catch (error) {
      console.warn('OpenAI health check failed:', error);
      return false;
    }
  }
}
