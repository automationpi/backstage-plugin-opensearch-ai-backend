# OpenSearch AI-enhanced Backend Plugin (Skeleton)

This is a backend-only Backstage plugin that aims to provide OpenSearch-based search with optional AI-assisted enhancements (query rewriting, result re-ranking, and semantic vector search).

Status: MVP with OpenSearch search, admin indexing routes, AI-assisted rewrite and heuristic re-ranking.

## Key Pieces
- `createRouter(options)`: exposes `/health` and `/query` routes.
- `OpenSearchClient`: stub for BM25/hybrid search and indexing.
- `QueryRewriteService`: stub for AI-assisted query rewriting.
- `ReRankerService`: stub for AI-based re-ranking.
- `FeatureToggle`: controls feature flags (rewrite, rerank, semantic).
- `Observability`: hooks for metrics, tracing, and logs.

## Features
- OpenSearch-based search with basic filters and highlights.
- Admin endpoints: ensure index template, bulk indexing, and reindex (Catalog/TechDocs/APIs).
- AI-assisted query rewriting (normalization, intents, synonyms) with timeouts and redaction.
- Heuristic re-ranking of top-K results with freshness and boosts.

## Config
See `docs/AI.md` and `docs/USAGE.md` for configuration and wiring examples.

## Build
From this directory:
```sh
npm install
npm run build
```

## License
UNLICENSED (internal scaffolding)
