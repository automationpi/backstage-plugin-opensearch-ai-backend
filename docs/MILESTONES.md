# Milestones

This file tracks key milestones and progress for the OpenSearch AI-enhanced Backend Plugin.

## Completed
- [x] Initial scaffolding of backend plugin structure (router, services stubs)
- [x] Created docs folder and summarized design/discussion
 - [x] Config-based router factory and feature toggles
 - [x] Basic OpenSearch HTTP client for search (BM25 via simple_query_string)
 - [x] Index template management and bulk indexing endpoints
 - [x] Basic indexer scaffolds (Catalog, TechDocs, APIs)
 - [x] Catalog ingestion orchestrator with paged fetch
 - [x] Admin route to trigger catalog reindex
 - [x] TechDocs and API ingestion orchestrators and admin routes
 - [x] Local dev docker-compose for OpenSearch
 - [x] Example `app-config.local.yaml`
 - [x] Phase 2: AI query rewrite service (pluggable provider, timeouts, redaction)
 - [x] Phase 3: Heuristic re-ranking with timeouts and top-K
 - [x] Build stabilization (standalone tsconfig, dev deps)
 - [x] Release artifacts: CHANGELOG, RELEASE guide, security notes
 - [x] Observability: Prometheus metrics, OTel spans, Grafana dashboard

## Planned
 - [ ] Connect providers to real data sources (TechDocs/APIs) (Phase 1)
 - [ ] Optional LLM-based re-ranking provider (Phase 3)
 - [ ] Optional semantic search with vectors (Phase 4)
 - [ ] Config-driven synonyms and boost weights (Phase 2/3)
 - [ ] Sampled logs and log correlation (Phase 5)
 - [ ] Rollout guide and examples (Phase 5)
 - [ ] Backstage module packaging (backend plugin module export)
