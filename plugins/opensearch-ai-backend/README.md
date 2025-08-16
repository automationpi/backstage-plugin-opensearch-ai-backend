# 🔍 OpenSearch AI-Enhanced Search for Backstage

[![npm version](https://badge.fury.io/js/@mexl%2Fbackstage-plugin-opensearch-ai-backend.svg)](https://badge.fury.io/js/@mexl%2Fbackstage-plugin-opensearch-ai-backend)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Transform your Backstage search experience with AI-powered query understanding and semantic search. This plugin supercharges OpenSearch with intelligent query rewriting, result re-ranking, and vector embeddings—all without requiring any frontend changes.

## ✨ What Makes This Special

- **🧠 Smart Query Understanding**: Uses OpenAI to understand what users actually mean
- **🔒 Privacy-First**: Advanced PII detection and redaction keeps your data safe  
- **⚡ Production-Ready**: Circuit breakers, caching, and retry logic ensure reliability
- **🎯 Zero Frontend Changes**: Drop-in replacement for existing search backends
- **📊 Vector Search**: Real semantic similarity using OpenAI embeddings
- **🔍 Multi-Source**: Searches across Catalog entities, TechDocs, and API specs

## 🚀 Quick Start

### 1. Install the Package

```bash
npm install @mexl/backstage-plugin-opensearch-ai-backend
```

### 2. Set Up OpenSearch

The easiest way to get started is with Docker:

```bash
# Start OpenSearch locally
docker run -d \
  -p 9200:9200 \
  -p 9600:9600 \
  -e "discovery.type=single-node" \
  -e "OPENSEARCH_INITIAL_ADMIN_PASSWORD=yourStrongPassword123!" \
  opensearchproject/opensearch:latest
```

Or use your existing OpenSearch cluster—this plugin works with any OpenSearch 2.x installation.

### 3. Configure Your Backstage Backend

Add the plugin to your `packages/backend/src/index.ts`:

```typescript
import { createRouterFromConfig } from '@mexl/backstage-plugin-opensearch-ai-backend';

// Create the router
const searchRouter = createRouterFromConfig({
  opensearch: {
    hosts: ['http://localhost:9200'],
    indexPrefix: 'backstage',
  },
  ai: {
    enabled: true,
    provider: 'openai',
    model: 'gpt-4o-mini',
    features: {
      rewrite: true,    // Smart query understanding
      rerank: true,     // Intelligent result ordering  
      semantic: true,   // Vector similarity search
    },
  },
});

// Mount the router in your backend
app.use('/api/opensearch-ai', searchRouter);
```

### 4. Set Your OpenAI API Key

```bash
# Set your OpenAI API key
export OPENAI_API_KEY="sk-your-key-here"
```

Or add it to your `app-config.yaml`:

```yaml
search:
  engine: opensearch-ai
  opensearch:
    hosts:
      - http://localhost:9200
    indexPrefix: backstage
  ai:
    enabled: true
    provider: openai
    apiKey: ${OPENAI_API_KEY}
    model: gpt-4o-mini
    embeddingModel: text-embedding-3-small
    temperature: 0.3
    features:
      rewrite: true
      rerank: true
      semantic: true
    privacy:
      redactEmails: true
      redactTokens: true
    budgets:
      rewriteMs: 120   # Max time for query rewriting
      rerankMs: 80     # Max time for re-ranking
```

### 5. Initialize Your Search Index

```bash
# Set up the search template
curl -X POST http://localhost:7007/api/opensearch-ai/admin/ensure-template

# Index your catalog
curl -X POST http://localhost:7007/api/opensearch-ai/admin/reindex/catalog

# Index your documentation (if you have TechDocs)
curl -X POST http://localhost:7007/api/opensearch-ai/admin/reindex/techdocs

# Index your APIs  
curl -X POST http://localhost:7007/api/opensearch-ai/admin/reindex/apis
```

### 6. Start Searching! 🎉

Your users can now search with natural language:

- **"How do I deploy to production?"** → Finds deployment guides and runbooks
- **"API for user management"** → Prioritizes user-related APIs and services
- **"incident response team contact"** → Surfaces on-call docs and team info
- **"kubernetes troubleshooting"** → Finds k8s docs, services, and guides

## 🛠 Advanced Configuration

### AI Provider Options

```yaml
ai:
  provider: openai
  model: gpt-4o-mini              # or gpt-4, gpt-3.5-turbo
  embeddingModel: text-embedding-3-small  # for semantic search
  endpoint: https://api.openai.com/v1     # custom endpoint for Azure OpenAI
  temperature: 0.3                # creativity vs. consistency (0-1)
```

### Privacy & Security

```yaml
ai:
  privacy:
    redactEmails: true
    redactTokens: true
    redactIPs: false
    redactPhoneNumbers: false
    redactSSNs: false
    customPatterns:
      - name: ticket_id
        pattern: /TICKET-\d+/g
        replacement: "[TICKET]"
```

### Performance Tuning

```yaml
ai:
  budgets:
    rewriteMs: 120    # Timeout for query rewriting
    rerankMs: 80      # Timeout for result re-ranking
  limits:
    rerankTopK: 50    # Number of results to re-rank
  features:
    rewrite: true     # Enable smart query understanding
    rerank: true      # Enable intelligent result ordering
    semantic: true    # Enable vector similarity search
```

### Caching Configuration

The plugin includes intelligent caching out of the box:
- **Query rewrites**: Cached for 5 minutes
- **Embeddings**: Cached for 1 hour  
- **Search results**: Not cached (always fresh)

### Circuit Breaker Settings

Built-in reliability features protect against AI service outages:
- **Failure threshold**: 5 failures trigger circuit breaker
- **Reset timeout**: 1 minute before retrying
- **Graceful degradation**: Falls back to basic search when AI fails

## 📊 Monitoring & Observability

### Prometheus Metrics

```bash
# Get metrics
curl http://localhost:7007/api/opensearch-ai/metrics
```

Key metrics include:
- `search_ai_query_rewrite_duration_ms`
- `search_ai_rerank_duration_ms`  
- `search_ai_cache_hit_ratio`
- `search_ai_circuit_breaker_state`

### Health Checks

```bash
# Check overall health
curl http://localhost:7007/api/opensearch-ai/health

# Returns:
{
  "status": "ok",
  "opensearch": "connected",
  "ai_provider": "healthy",
  "cache": "active"
}
```

## 🔌 API Reference

### Search Endpoint

```bash
POST /api/opensearch-ai/query
Content-Type: application/json

{
  "query": "how to deploy microservices",
  "filters": {
    "kind": ["Component", "System"]
  },
  "page": 1,
  "pageSize": 20
}
```

**Response:**
```json
{
  "results": [
    {
      "title": "Microservice Deployment Guide",
      "url": "/docs/deployment/microservices",
      "text": "Learn how to deploy microservices...",
      "score": 0.95,
      "source": "techdocs"
    }
  ],
  "total": 42,
  "timings": {
    "rewriteMs": 85,
    "searchMs": 23,
    "rerankMs": 34,
    "totalMs": 142
  }
}
```

### Admin Endpoints

```bash
# Index Management
POST /api/opensearch-ai/admin/ensure-template
POST /api/opensearch-ai/admin/reindex/catalog
POST /api/opensearch-ai/admin/reindex/techdocs  
POST /api/opensearch-ai/admin/reindex/apis

# Bulk Indexing
POST /api/opensearch-ai/index
{
  "source": "catalog",
  "docs": [...]
}
```

## 🧪 Testing

Basic unit tests are available for core utilities:

```bash
# Run available tests
cd plugins/opensearch-ai-backend
npm test
```

**Current coverage**: Core service utilities (cache, error handling, PII redaction)  
**Coming soon**: Integration tests with OpenSearch and AI providers

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Write tests** for your changes
4. **Run the test suite**: `npm test`
5. **Submit a pull request**

### Development Setup

```bash
# Clone the repo
git clone <this-repo>
cd backstage-opensearch-ai-plugin

# Install dependencies
cd plugins/opensearch-ai-backend
npm install

# Start OpenSearch for testing
docker run -d \
  -p 9200:9200 \
  -p 9600:9600 \
  -e "discovery.type=single-node" \
  -e "OPENSEARCH_INITIAL_ADMIN_PASSWORD=yourStrongPassword123!" \
  opensearchproject/opensearch:latest

# Build the plugin
npm run build

# Run tests
npm test
```

## 🐛 Troubleshooting

### Common Issues

**"OpenAI API key not found"**
- Set `OPENAI_API_KEY` environment variable
- Or configure `ai.apiKey` in your app-config.yaml

**"Circuit breaker is OPEN"**  
- AI service is experiencing issues
- Plugin automatically falls back to basic search
- Check OpenAI service status

**"No search results"**
- Run the reindex commands to populate your search index
- Check OpenSearch is running and accessible
- Verify your `indexPrefix` configuration

**Performance Issues**
- Reduce `ai.budgets.rewriteMs` and `rerankMs` for faster responses
- Disable `semantic: false` if you don't need vector search
- Monitor cache hit rates in metrics

### Debug Mode

Enable detailed logging:

```yaml
# In your app-config.yaml
backend:
  verboseLogging: true
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on top of [Backstage](https://backstage.io/)
- Powered by [OpenSearch](https://opensearch.org/)
- AI capabilities provided by [OpenAI](https://openai.com/)

---

**Made with ❤️ for the Backstage community**

Transform your developer portal search experience today! 🚀