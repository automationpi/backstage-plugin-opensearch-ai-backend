# Integration with Backstage Backend

This guide shows how to mount the router and gate admin endpoints with auth/permissions.

## Basic Mount
```ts
import express from 'express';
import { createRouterFromConfig } from '@internal/backstage-plugin-opensearch-ai-backend';

export async function createPluginRouter(deps: {
  catalogProvider?: any;
}) {
  const router = createRouterFromConfig({
    opensearch: { hosts: ['http://localhost:9200'], indexPrefix: 'backstage' },
    ai: { enabled: true, features: { rewrite: true, rerank: true } },
  }, {
    catalogProvider: deps.catalogProvider,
  });
  return router;
}
```

## Admin Route Guarding
Use an Express middleware or Backstage’s permission framework to restrict `/admin/*` routes.

### Simple Express Middleware
```ts
function requireAdmin(req, res, next) {
  const user = req.user; // attach via your auth middleware
  if (user?.roles?.includes('admin')) return next();
  return res.status(403).json({ error: 'forbidden' });
}

app.use('/api/opensearch-ai/admin', requireAdmin);
```

### Backstage Permissions (sketch)
```ts
import { createPermissionIntegrationRouter, isPermission } from '@backstage/plugin-permission-node';
// Define a custom permission for search-admin and check via permissionClient
```

## Metrics Scrape
Expose Prometheus metrics at `/api/opensearch-ai/metrics` and configure Prometheus to scrape it. See `docs/OBSERVABILITY.md`.
