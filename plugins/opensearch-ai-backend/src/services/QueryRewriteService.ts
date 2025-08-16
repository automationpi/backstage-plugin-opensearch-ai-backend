import type { AiProvider, RewriteOutput } from './ai/AiProvider';
import { PIIRedactionService, type PIIRedactionConfig } from './PIIRedactionService';

export class QueryRewriteService {
  private piiRedaction: PIIRedactionService;

  constructor(
    private readonly options: {
      enabled: boolean;
      timeoutMs?: number;
      redactEmails?: boolean;
      redactTokens?: boolean;
      maxQueryLen?: number;
      piiRedaction?: PIIRedactionConfig;
    },
    private readonly provider?: AiProvider,
  ) {
    this.piiRedaction = new PIIRedactionService({
      redactEmails: options.redactEmails ?? true,
      redactTokens: options.redactTokens ?? true,
      ...options.piiRedaction,
    });
  }

  isEnabled() {
    return !!this.options.enabled && !!this.provider;
  }

  async rewrite(query: string, context?: Record<string, unknown>): Promise<RewriteOutput & { piiFound?: string[] }> {
    if (!this.isEnabled()) return { query };

    const { redacted, found } = this.piiRedaction.redact(this.truncate(query));
    
    if (found.length > 0) {
      console.warn(`PII detected and redacted in query: ${found.join(', ')}`);
    }

    const p = this.provider!
      .rewrite({ query: redacted, context })
      .then(r => ({ ...r, query: r.query || redacted, piiFound: found.length > 0 ? found : undefined }));
    
    try {
      if (this.options.timeoutMs && this.options.timeoutMs > 0) {
        const timeout = new Promise<RewriteOutput>((_resolve, reject) =>
          setTimeout(() => reject(new Error('rewrite timeout')), this.options.timeoutMs),
        );
        return await Promise.race([p, timeout]);
      }
      return await p;
    } catch (error) {
      console.warn('Query rewrite failed:', error);
      return { query: redacted, piiFound: found.length > 0 ? found : undefined }; // safe fallback with redacted query
    }
  }

  private truncate(q: string): string {
    const max = this.options.maxQueryLen ?? 512;
    return q.length > max ? q.slice(0, max) : q;
  }
}
