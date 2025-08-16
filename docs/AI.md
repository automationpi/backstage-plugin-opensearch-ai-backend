# AI Configuration and Query Rewriting

This plugin supports optional AI-assisted query rewriting via a pluggable provider interface. In the current skeleton, an `OpenAI`-named provider is included as a stub that performs light normalization and intent tagging (no network calls).

## Config Keys

Under `search.ai`:
- `enabled`: boolean; master switch for AI features.
- `provider`: `openai` | `azure-openai` | `bedrock` | `custom` (placeholder; `openai` default).
- `model`: provider model identifier (e.g., `gpt-4o-mini`).
- `features.rewrite`: enable query rewriting phase.
- `features.rerank`: enable AI-assisted re-ranking phase.
- `budgets.rewriteMs`: per-request timeout for rewrite stage (default 120ms).
- `budgets.rerankMs`: per-request timeout for re-ranking stage (default 80ms).
- `limits.rerankTopK`: number of top results to re-rank (default 50).
- `synonyms`: optional map to add custom synonyms per intent/keyword.

Ranking boosts:
- `ranking.boosts.sourceWeight`: weight for `source` boosts (default 2.0)
- `ranking.boosts.tagWeight`: weight for `tags` boosts (default 1.5)
- `privacy.redactEmails`: redacts emails in outbound prompts (default true).
- `privacy.redactTokens`: redacts token/secret-like strings (default true).

Example:

```yaml
search:
  engine: opensearch-ai
  opensearch:
    hosts: ["http://localhost:9200"]
    indexPrefix: backstage
  ai:
    enabled: true
    provider: openai
    model: gpt-4o-mini
    features:
      rewrite: true
      rerank: false
    budgets:
      rewriteMs: 120
    privacy:
      redactEmails: true
      redactTokens: true
    synonyms:
      api: ["openapi", "swagger", "rest"]
      owner: ["maintainer", "team"]
  ranking:
    boosts:
      sourceWeight: 2.0
      tagWeight: 1.5
```

## Runtime Behavior
- If `rewrite` enabled, the service:
  - Truncates and redacts the input query.
  - Calls the provider with a timeout budget.
  - Receives: normalized `query`, `intent[]`, `expanded[]` synonyms, optional `boosts` and `filters` hints.
  - On timeout/error, safely falls back to the original query without hints.
- Search uses hints to improve relevance:
  - `expanded[]` terms are OR-ed into the query string.
  - `boosts.sources[]` adds scoring bias for matching `source` (e.g., `techdocs`, `apis`).
  - `boosts.tags[]` adds scoring bias for matching `tags` (e.g., `runbook`).
  - `filters` apply non-strict term filters (e.g., `kind: [Component, System]`).

### Re-ranking Phase
- If enabled, a heuristic provider re-orders the top-K results by:
  - Title/body match to the query string.
  - Source/tag boosts derived from intents.
  - Freshness (linear decay over N days; default 30).
- Timeout and safe fallback preserve original OpenSearch ranking on issues.

### Optional Semantic Search (Vectors)
- Enable with `features.semantic: true` and configure `ai.semantic.dim` (default 384).
- The plugin creates an `embedding` `knn_vector` field via the index template.
- A lightweight no-op embedding provider hashes the query into a normalized vector for dev/testing.
- When a vector is present, search executes a k-NN query (`knn`) with optional filters.
- In production, replace the no-op provider with a real embedding model and index document vectors.

## Extending Providers
Implement `AiProvider` with `rewrite(input) => Promise<{query, intent[]}>` and pass it via the factory or contribute a new provider under `src/services/ai`.
