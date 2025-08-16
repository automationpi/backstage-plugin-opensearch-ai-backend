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

### Core Search Features
- OpenSearch-based search with BM25 scoring, filters, and highlights
- Admin endpoints: index template management, bulk indexing, and reindexing (Catalog/TechDocs/APIs)

### AI Enhancement Features
Configure these features using the `features` config block:

```yaml
opensearch-ai:
  features:
    rewrite: true    # AI query rewriting
    rerank: true     # AI result re-ranking  
    semantic: true   # Vector semantic search
```

#### Query Rewriting (`rewrite: true`)
- **Purpose**: Transforms user queries using AI to improve search results
- **How it works**: Uses OpenAI GPT-4o-mini to normalize queries, expand synonyms, and clarify intent
- **Impact**: Better matching for natural language queries, handles typos and ambiguous terms
- **Cost**: ~$0.0001 per query (cached for 5 minutes to reduce costs)
- **Example**: "api docs" → "API documentation endpoints"

#### Result Re-ranking (`rerank: true`) 
- **Purpose**: Re-orders search results using AI to improve relevance
- **How it works**: Uses heuristic scoring based on content freshness, type boosts, and relevance
- **Impact**: More relevant results appear first, especially for broad queries
- **Cost**: Minimal (computation-based, no API calls)
- **Compatibility**: Works with or without rewrite feature

#### Semantic Search (`semantic: true`)
- **Purpose**: Enables meaning-based search using vector embeddings
- **How it works**: Uses OpenAI text-embedding-3-small to create vector representations
- **Impact**: Finds conceptually related content even without exact keyword matches
- **Cost**: ~$0.00002 per query (cached for 1 hour)
- **Example**: "authentication" finds results about "login", "OAuth", "security"

### Feature Compatibility
- **All features work independently** - you can enable any combination
- **Rewrite + Semantic**: Best for natural language queries with concept matching
- **Rerank + Semantic**: Good balance of relevance and semantic understanding
- **All three enabled**: Maximum search quality but highest API costs

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
