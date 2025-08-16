# Enabling Semantic Search in Production

This guide outlines how to turn on vector (semantic) search in a controlled way using OpenSearch k-NN and an embedding provider.

## Prerequisites
- OpenSearch 2.9+ with k-NN support (Lucene engine recommended).
- The plugin at v0.2.1+ (vector scaffold included).
- An embedding provider (OpenAI/Azure/Bedrock/self-hosted). For dev, the plugin ships with a no-op hash-based provider; replace it for prod.

## High-level Steps
1) Configure OpenSearch and the plugin
2) Implement/wire an embedding provider
3) Add embedding generation to indexers
4) Backfill existing content
5) Enable semantic query path and monitor
6) Iterate on hybrid ranking and costs

## 1) Configure
- app-config:
```yaml
search:
  engine: opensearch-ai
  opensearch:
    hosts: ["https://<os-host>:9200"]
    indexPrefix: backstage
  ai:
    enabled: true
    features:
      rewrite: true
      rerank: true
      semantic: true       # turn on vector mode
    semantic:
      dim: 384             # match your model output size
  ranking:
    boosts:
      sourceWeight: 2.0
      tagWeight: 1.5
  observability:
    sampleRate: 0.02
```
- Create/refresh templates: `POST /api/opensearch-ai/admin/ensure-template` (sets `knn_vector` field when semantic enabled).

## 2) Embedding Provider
Replace the included `NoOpEmbeddingService` with a real provider. Sketch:
```ts
import type { EmbeddingService } from '@mexl/backstage-plugin-opensearch-ai-backend';

class OpenAIEmbeddingService implements EmbeddingService {
  constructor(private readonly model = 'text-embedding-3-small', private readonly apiKey = process.env.OPENAI_API_KEY!) {}
  dim() { return 1536; }
  async embed(text: string): Promise<number[]> {
    // call provider and return vector
    return [];
  }
}
```
Wire it in `pluginFactory` instead of `NoOpEmbeddingService`:
```ts
embedding: featureToggle.isSemanticEnabled() ? new OpenAIEmbeddingService() : undefined
```

## 3) Indexers: add `embedding`
- For each indexed doc, generate a vector from a stable content string (e.g., `${title}\n\n${text}`) and include it:
```ts
const content = `${doc.title}\n\n${doc.text ?? ''}`.trim();
const embedding = await embeddingService.embed(content);
await openSearch.bulkIndex('techdocs', [{ ...doc, embedding }]);
```
- Do this in Catalog, TechDocs, and APIs indexers during ingestion and updates.

## 4) Backfill
- Run a one-time backfill job to compute and store embeddings for all existing docs.
- Recommendations:
  - Batch size: 64–256 items per call
  - Parallelism: keep provider QPS within rate limits
  - Persist progress (cursor or last ID) and resume on failure
  - Validate random samples for non-zero vectors and consistent dimensions

## 5) Query Path
- With `semantic: true`, the plugin will compute a query vector and issue a k-NN search with filters.
- Hybrid options:
  - Start with pure k-NN + filters (as scaffolded) for simplicity
  - Evolve to hybrid: BM25 primary + k-NN rescore or blend (requires additional code)
- Budgets/latency:
  - Keep `rewriteMs` ~120ms and `rerankMs` ~80ms
  - Monitor vector latency; adjust `num_candidates` to trade latency vs. recall

## 6) Tuning and Monitoring
- OpenSearch knobs:
  - Template uses HNSW Lucene; tune `m` and `ef_search` in index settings for your dataset size
  - `knn.num_candidates`: larger improves recall but increases latency
- Provider knobs:
  - Use a smaller/cheaper embedding model for lower costs/latency where acceptable
  - Truncate content to provider token limits
- Observability:
  - Prometheus: latency histograms for `search` stage; QPS and AI fallback
  - Tracing: ensure your backend has OTel SDK/exporter initialized
  - Grafana: import `grafana/dashboards/opensearch-ai.json`

## Rollout Plan
- Phase A: Backfill embeddings with semantic disabled; validate vectors
- Phase B: Enable semantic on a staging env; verify result quality and p95 latency
- Phase C: Canary in prod for a cohort; watch AI fallback and latency
- Phase D: Widen rollout; tune `num_candidates`, boosts, and index settings

## Quality Validation (suggested)
- Offline eval: construct ~50–100 labeled queries with expected top-3 docs; measure NDCG@3 before/after
- Online signals: CTR@k uplift, re-query and abandonment rates
- Persona tests: SRE runbooks, API references, migration guides

## Security & Cost
- Respect data boundaries: avoid sending sensitive doc text to external providers unless approved
- Cache embeddings for unchanged content
- Batch provider calls; implement retry with backoff
- Use provider-side rate limiting and per-request budgets

## Pitfalls
- Dimension mismatches: ensure `ai.semantic.dim` matches provider output
- Index mapping changes require reindex/backfill; version your embeddings
- Very short docs can yield poor vectors — use fallback to BM25 where needed

## Next Steps
- Implement hybrid BM25 + k-NN blending or rescoring
- Add an embedding job queue with persistence and concurrency controls
- Add per-source embedding strategies (e.g., TechDocs page-level, APIs per endpoint)
