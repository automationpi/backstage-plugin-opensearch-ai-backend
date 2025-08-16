# Usage (Early Skeleton)

This plugin exposes a router that can be constructed from config and mounted into a Backstage backend.

Example (pseudo-code for Backstage backend module):

```ts
import express from 'express';
import { createRouterFromConfig } from '../plugins/opensearch-ai-backend';

const app = express();
app.use(express.json());

const router = createRouterFromConfig({
  opensearch: {
    hosts: ["https://localhost:9200"],
    indexPrefix: "backstage",
    auth: { type: 'basic', username: process.env.OPENSEARCH_USERNAME!, password: process.env.OPENSEARCH_PASSWORD! },
    tls: { rejectUnauthorized: false },
  },
  ai: { features: { rewrite: false, rerank: false } },
}, /* deps */);

app.use('/api/opensearch-ai', router);
app.listen(7007);
```

Endpoints:
- `GET /api/opensearch-ai/health` → `{ status: "ok" }`
- `GET /api/opensearch-ai/metrics` → Prometheus metrics
- `POST /api/opensearch-ai/admin/ensure-template` → `{ ok: true }`
- `POST /api/opensearch-ai/admin/reindex/catalog` → triggers catalog ingestion (if configured)
- `POST /api/opensearch-ai/admin/reindex/techdocs` → triggers TechDocs ingestion (if configured)
- `POST /api/opensearch-ai/admin/reindex/apis` → triggers APIs ingestion (if configured)
- `POST /api/opensearch-ai/index` with body `{ source: 'catalog'|'techdocs'|'apis', docs: IndexedDoc[] }`
- `POST /api/opensearch-ai/query` with body `{ query: string, filters?: object, page?: number, pageSize?: number }`

Notes:
- Ensure index template via `/admin/ensure-template` before indexing.
- The OpenSearch client uses `_search` with `simple_query_string`; bulk indexing via `_bulk` to `${indexPrefix}-{source}`.
- AI features (rewrite/rerank) are stubbed and disabled by default.

## Wiring the Catalog Provider (Backstage)
In a real Backstage backend, pass a provider that pages through entities (using `@backstage/catalog-client`). Example sketch:

```ts
import { CatalogClient } from '@backstage/catalog-client';
import { createRouterFromConfig } from '@internal/backstage-plugin-opensearch-ai-backend';

const catalog = new CatalogClient({ discoveryApi });

const provider = {
  async fetchEntities(page?: { after?: string | null; limit?: number }) {
    const res = await catalog.getEntities({
      fields: ['kind','metadata','spec'],
      after: page?.after ?? undefined,
      limit: page?.limit ?? 500,
    });
    return { items: res.items as any[], nextPageCursor: res.pageInfo?.nextCursor ?? null };
  },
};

const router = createRouterFromConfig(config, { catalogProvider: provider });
app.use('/api/opensearch-ai', router);
```

## Wiring TechDocs and API Providers
Provide paginated fetchers for TechDocs pages and API definitions:

```ts
const techDocsProvider = {
  async fetchPages(page?: { after?: string | null; limit?: number }) {
    // Implement using your TechDocs source; example returns empty page
    return { items: [], nextPageCursor: null };
  },
};

const apiProvider = {
  async fetchApis(page?: { after?: string | null; limit?: number }) {
    // Implement using your API registry/source; example returns empty page
    return { items: [], nextPageCursor: null };
  },
};

const router = createRouterFromConfig(config, {
  catalogProvider,
  techDocsProvider,
  apiProvider,
});
```

## Local Development
Use the included docker-compose to run OpenSearch locally (HTTP, security disabled):

```sh
docker compose -f dev/docker-compose.yml up -d
```

Then configure the plugin using `examples/app-config.local.yaml` values:
- `search.opensearch.hosts: ["http://localhost:9200"]`
- `search.opensearch.indexPrefix: "backstage"`

Run the backend and test endpoints:
- `POST /api/opensearch-ai/admin/ensure-template`
- `POST /api/opensearch-ai/admin/reindex/catalog`
- `POST /api/opensearch-ai/query` with `{ "query": "example" }`
- `GET /api/opensearch-ai/metrics` for Prometheus metrics

## Semantic Search
For a production rollout of vector search, see `docs/SEMANTIC_SEARCH.md`.
