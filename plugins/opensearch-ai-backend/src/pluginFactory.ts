import { createRouter, type PluginConfig, type PluginServices } from './router';
import { OpenSearchClient } from './services/OpenSearchClient';
import { QueryRewriteService } from './services/QueryRewriteService';
import { ReRankerService } from './services/ReRankerService';
import { FeatureToggle } from './services/FeatureToggle';
import { Observability } from './services/Observability';
import { InMemoryCacheService } from './services/CacheService';
import type { CatalogProvider, TechDocsProvider, ApiProvider } from './types/Backstage';
import { CatalogIndexer } from './indexers/CatalogIndexer';
import { CatalogIngestion } from './ingestion/CatalogIngestion';
import { OpenAIProvider } from './services/ai/OpenAIProvider';
import { HeuristicReRankProvider } from './services/ai/HeuristicReRankProvider';
import { NoOpEmbeddingService, OpenAIEmbeddingService } from './services/ai/EmbeddingService';
import { TechDocsIndexer } from './indexers/TechDocsIndexer';
import { TechDocsIngestion } from './ingestion/TechDocsIngestion';
import { ApiIndexer } from './indexers/ApiIndexer';
import { ApiIngestion } from './ingestion/ApiIngestion';

export type PluginDeps = {
  catalogProvider?: CatalogProvider;
  techDocsProvider?: TechDocsProvider;
  apiProvider?: ApiProvider;
};

export function createRouterFromConfig(config: PluginConfig, deps: PluginDeps = {}) {
  // Create cache service
  const cache = new InMemoryCacheService({
    defaultTtlSeconds: 300, // 5 minutes default
    checkPeriodSeconds: 60,
  });

  const featureToggle = new FeatureToggle({
    rewrite: !!config.ai?.features?.rewrite,
    rerank: !!config.ai?.features?.rerank,
    semantic: !!config.ai?.features?.semantic,
  });

  const openSearch = new OpenSearchClient({
    hosts: config.opensearch.hosts,
    indexPrefix: config.opensearch.indexPrefix,
    auth: config.opensearch.auth,
    tls: config.opensearch.tls,
    ranking: config.ranking?.boosts,
    vector: { enabled: !!config.ai?.features?.semantic, dim: (config as any).ai?.semantic?.dim ?? 384 },
  } as any);

  let queryRewrite: QueryRewriteService | undefined;
  if (featureToggle.isRewriteEnabled() && config.ai?.enabled !== false) {
    // Choose provider
    let provider: any;
    if (config.ai?.provider === 'openai' || !config.ai?.provider) {
      const apiKey = process.env.OPENAI_API_KEY || config.ai?.apiKey;
      if (!apiKey) {
        console.warn('OpenAI API key not found. Set OPENAI_API_KEY environment variable or config.ai.apiKey');
      } else {
        provider = new OpenAIProvider({
          model: config.ai?.model ?? 'gpt-4o-mini',
          synonyms: config.ai?.synonyms,
          apiKey,
          endpoint: config.ai?.endpoint,
          temperature: config.ai?.temperature,
        }, cache);
      }
    }
    if (provider) {
      queryRewrite = new QueryRewriteService(
        {
          enabled: true,
          timeoutMs: config.ai?.budgets?.rewriteMs ?? 120,
          redactEmails: config.ai?.privacy?.redactEmails ?? true,
          redactTokens: config.ai?.privacy?.redactTokens ?? true,
          maxQueryLen: 512,
        },
        provider,
      );
    }
  }

  let reRanker: ReRankerService | undefined;
  if (featureToggle.isReRankEnabled() && config.ai?.enabled !== false) {
    const provider = new HeuristicReRankProvider({ freshnessDays: 30 });
    reRanker = new ReRankerService(
      { enabled: true, timeoutMs: config.ai?.budgets?.rerankMs ?? 80, topK: (config as any).ai?.limits?.rerankTopK ?? 50 },
      provider,
    );
  }

  const observability = new Observability({ sampleRate: config.observability?.sampleRate });

  // Create embedding service
  let embedding: any = undefined;
  if (featureToggle.isSemanticEnabled()) {
    const apiKey = process.env.OPENAI_API_KEY || config.ai?.apiKey;
    if (apiKey && (config.ai?.provider === 'openai' || !config.ai?.provider)) {
      embedding = new OpenAIEmbeddingService({
        apiKey,
        model: config.ai?.embeddingModel ?? 'text-embedding-3-small',
        endpoint: config.ai?.endpoint,
        dimension: (config as any).ai?.semantic?.dim ?? 1536,
      }, cache);
    } else {
      console.warn('Using NoOp embedding service. Set OPENAI_API_KEY for semantic search.');
      embedding = new NoOpEmbeddingService((config as any).ai?.semantic?.dim ?? 384);
    }
  }

  const services: PluginServices = {
    openSearch,
    queryRewrite,
    reRanker,
    featureToggle,
    observability,
    embedding,
  };

  const router = createRouter(services);

  // Optionally attach ingestion orchestrator as properties for external wiring
  if (deps.catalogProvider) {
    const catalogIndexer = new CatalogIndexer(openSearch);
    const orchestrator = new CatalogIngestion(deps.catalogProvider, catalogIndexer, observability);
    // @ts-ignore - attach for retrieval by downstream code if needed
    (router as any).catalogIngestion = orchestrator;
  }

  if (deps.techDocsProvider) {
    const techIndexer = new TechDocsIndexer(openSearch);
    const orchestrator = new TechDocsIngestion(deps.techDocsProvider, techIndexer, observability);
    // @ts-ignore
    (router as any).techdocsIngestion = orchestrator;
  }

  if (deps.apiProvider) {
    const apiIndexer = new ApiIndexer(openSearch);
    const orchestrator = new ApiIngestion(deps.apiProvider, apiIndexer, observability);
    // @ts-ignore
    (router as any).apisIngestion = orchestrator;
  }

  return router;
}
