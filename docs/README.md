# OpenSearch AI-enhanced Backend Plugin for Backstage

This document captures the high-level concept, goals, design principles, operating modes, roadmap, personas, and configuration/lifecycle design discussed so far.

## Plugin Concept
- Backend-only search plugin for Backstage that uses OpenSearch by default and optionally applies AI to improve query understanding and result ranking. No frontend changes required.

## Goals
- Drop-in replacement for default Lunr/OpenSearch backend.
- Optional AI-assisted enhancements that can be toggled per environment.

## Core Design Principles
- Pluggable: Default OpenSearch; AI optional and configurable.
- AI-enhanced: AI improves query understanding and ranking when enabled.
- Configurable: Toggle features via `app-config.yaml`; support envs with/without AI tokens.
- Backend-only: No UI changes; compatible with existing Backstage search frontend.

## Operating Modes
- Pure OpenSearch Mode: Use OpenSearch only; best for environments without AI.
- AI-Assisted Mode: AI adds query rewriting and/or re-ranking on top of OpenSearch.

## High-Level Roadmap
1. Phase 1 (MVP): Core OpenSearch integration; index/search catalog entities; basic filters; AI disabled by default.
2. Phase 2: AI-assisted query rewriting and basic intent detection; safe fallbacks.
3. Phase 3: AI-based result re-ranking of top-N search hits; cost controls.
4. Phase 4: Optional semantic search using vectors (k-NN) and embeddings.
5. Phase 5: Observability and monitoring of query types, fallback rates, AI usage and cost.

## Personas
- Platform Engineer (Backstage Admin): reliability, latency, cost; wants guardrails.
- Service Developer: natural language queries; benefits from rewriting and ranking.
- SRE/On-call: fast, precise runbooks/incidents; intent-aware boosts.
- Tech Writer/Docs Owner: discoverability; synonym/alias expansion and ranking.
- Security/Compliance: strict data boundaries; auditing and toggleable AI usage.

## Use Cases → Phase Fit
- Natural language "how do I X?": Phase 2 rewrite; Phase 3 re-rank improves top-3.
- Find owner/contacts: Phase 2 synonyms; Phase 3 minor; Phase 4 optional vectors.
- Incident/runbook lookup: Phase 2 intent; Phase 3 re-rank with freshness/priority.
- API usage/examples: Phase 2 rewrite; Phase 3 re-rank TechDocs/API refs; Phase 4 vectors.
- Deprecation/migration guides: Phase 2 rewrite; Phase 3 elevate official guidance/ADRs.

## Configuration & Lifecycle (High Level)
- Config Keys (example):
  - `search.engine: opensearch-ai`
  - `search.opensearch.hosts`, `indexPrefix`, `auth.*`
  - `search.ai.enabled`, `provider`, `model`, `features.rewrite|rerank|semantic`
  - `search.ai.budgets.totalMs|rewriteMs|rerankMs`
  - `search.ai.limits.rerankTopK|maxTokens|allowOutboundFields`
  - `search.ranking.boosts.*`, `freshness.days`
  - `search.observability.metrics|trace|sampleRate`
  - `search.failover.onAiError`, `circuitBreaker.*`
- Lifecycle:
  - Startup: read config, init OpenSearch, register indexers; init AI client if enabled.
  - Indexing: catalog entities, TechDocs, APIs; optional vectors if semantic enabled.
  - Search: optional rewrite → OpenSearch query → optional re-rank; return in Backstage shape.
  - Fallbacks: enforce timeouts/budgets; circuit-break AI on errors; safe defaults.

## Current Status
- Initial plugin structure scaffolded with placeholder services and router.
- Docs initialized summarizing concept and design.

See `docs/MILESTONES.md` for progress tracking.

