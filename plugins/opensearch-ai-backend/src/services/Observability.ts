import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export type QueryRecord = {
  query: string;
  effectiveQuery: string;
  timings: Record<string, number>;
};

export class Observability {
  private readonly registry: Registry;
  private readonly tracer = trace.getTracer('opensearch-ai');

  private readonly queryLatency: Histogram<string>;
  private readonly queryCounter: Counter<string>;
  private readonly aiUsage: Counter<string>;
  private readonly errors: Counter<string>;
  private readonly indexed: Counter<string>;

  private readonly sampleRate: number;

  constructor(opts?: { registry?: Registry; sampleRate?: number }) {
    this.registry = opts?.registry ?? new Registry();
    this.sampleRate = opts?.sampleRate ?? 0;
    // Register default node metrics once per registry
    collectDefaultMetrics({ register: this.registry });

    const buckets = [10, 25, 50, 100, 200, 400, 800, 1600, 3200];
    this.queryLatency = new Histogram({
      name: 'opensearch_ai_query_latency_ms',
      help: 'Latency per stage in milliseconds',
      labelNames: ['stage'] as const,
      buckets,
      registers: [this.registry],
    });
    this.queryCounter = new Counter({
      name: 'opensearch_ai_query_total',
      help: 'Total queries processed',
      labelNames: ['outcome'] as const,
      registers: [this.registry],
    });
    this.aiUsage = new Counter({
      name: 'opensearch_ai_ai_usage_total',
      help: 'AI stage usage and outcomes',
      labelNames: ['stage', 'outcome'] as const,
      registers: [this.registry],
    });
    this.errors = new Counter({
      name: 'opensearch_ai_errors_total',
      help: 'Errors by stage',
      labelNames: ['stage'] as const,
      registers: [this.registry],
    });
    this.indexed = new Counter({
      name: 'opensearch_ai_indexed_total',
      help: 'Indexed documents by source',
      labelNames: ['source'] as const,
      registers: [this.registry],
    });
  }

  recordQuery(record: QueryRecord) {
    const span = this.tracer.startSpan('search.query');
    try {
      span.setAttributes({
        'search.query.length': record.query.length,
        'search.effective.length': record.effectiveQuery.length,
      });
      for (const [k, v] of Object.entries(record.timings)) {
        this.queryLatency.labels(k).observe(v);
        span.setAttribute(`timing.${k}`, v);
      }
      this.queryCounter.labels('success').inc();
      span.setStatus({ code: SpanStatusCode.OK });
    } finally {
      span.end();
    }
  }

  recordError(stage: string, error: unknown) {
    const span = this.tracer.startSpan(`error.${stage}`);
    try {
      this.errors.labels(stage).inc();
      this.queryCounter.labels('failure').inc();
      span.recordException(error as any);
      span.setStatus({ code: SpanStatusCode.ERROR });
    } finally {
      span.end();
    }
  }

  recordIndexing(event: { source: string; pages: number; items: number }) {
    this.indexed.labels(event.source).inc(event.items);
    const span = this.tracer.startSpan('indexing.batch');
    span.setAttributes({ 'index.source': event.source, 'index.pages': event.pages, 'index.items': event.items });
    span.end();
  }

  recordAiUsage(event: { stage: 'rewrite' | 'rerank'; success: boolean; ms?: number }) {
    this.aiUsage.labels(event.stage, event.success ? 'success' : 'failure').inc();
    if (typeof event.ms === 'number') this.queryLatency.labels(event.stage).observe(event.ms);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  metricsContentType(): string {
    return this.registry.contentType;
  }

  recordDiagnostic(event: Record<string, unknown>) {
    if (this.sampleRate > 0 && Math.random() < this.sampleRate) {
      // Simple sampled log; replace with your logger if desired
      // eslint-disable-next-line no-console
      console.log('[opensearch-ai]', JSON.stringify(event));
    }
  }
}
