import type { Request, Response } from 'express';
import { Router } from 'express';
import { OpenSearchClient } from './services/OpenSearchClient';
import { QueryRewriteService } from './services/QueryRewriteService';
import { ReRankerService } from './services/ReRankerService';
import { FeatureToggle } from './services/FeatureToggle';
import { Observability } from './services/Observability';
import { EmbeddingService } from './services/ai/EmbeddingService';

export type PluginConfig = {
  opensearch: {
    hosts: string[];
    indexPrefix?: string;
    auth?: { type?: 'basic' | 'bearer'; username?: string; password?: string; token?: string };
    tls?: { rejectUnauthorized?: boolean };
  };
  ai?: {
    enabled?: boolean;
    provider?: 'openai' | 'azure-openai' | 'bedrock' | 'custom';
    model?: string;
    embeddingModel?: string;
    apiKey?: string;
    endpoint?: string;
    temperature?: number;
    budgets?: { totalMs?: number; rewriteMs?: number; rerankMs?: number };
    privacy?: { redactEmails?: boolean; redactTokens?: boolean };
    features?: { rewrite?: boolean; rerank?: boolean; semantic?: boolean };
    limits?: { rerankTopK?: number };
    synonyms?: Record<string, string[]>; // config-driven synonyms
  };
  ranking?: {
    boosts?: { sourceWeight?: number; tagWeight?: number };
  };
  observability?: { sampleRate?: number };
};

export type PluginServices = {
  openSearch: OpenSearchClient;
  queryRewrite?: QueryRewriteService;
  reRanker?: ReRankerService;
  featureToggle: FeatureToggle;
  observability: Observability;
  embedding?: EmbeddingService;
};

export function createRouter(services: PluginServices) {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Prometheus metrics endpoint
  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
      const body = await services.observability.getMetrics();
      res.setHeader('Content-Type', services.observability.metricsContentType());
      res.send(body);
    } catch (e: any) {
      services.observability.recordError('metrics', e);
      res.status(500).json({ error: 'metrics failed', message: e?.message });
    }
  });

  // Admin: ensure index template exists
  router.post('/admin/ensure-template', async (_req: Request, res: Response) => {
    try {
      await services.openSearch.ensureIndexTemplate();
      res.json({ ok: true });
    } catch (e: any) {
      services.observability.recordError('ensure-template', e);
      res.status(500).json({ error: 'Failed to ensure index template', message: e?.message });
    }
  });

  // Admin: bulk index documents
  router.post('/index', async (req: Request, res: Response) => {
    const { source, docs } = req.body ?? {};
    if (!source || !Array.isArray(docs)) {
      res.status(400).json({ error: 'Expected { source, docs[] }' });
      return;
    }
    try {
      const result = await services.openSearch.bulkIndex(String(source), docs);
      res.json({ ok: true, ...result });
    } catch (e: any) {
      services.observability.recordError('bulk-index', e);
      res.status(500).json({ error: 'Bulk indexing failed', message: e?.message });
    }
  });

  // Admin: trigger catalog reindex if orchestrator attached by factory
  router.post('/admin/reindex/catalog', async (_req: Request, res: Response) => {
    const anyRouter = router as any;
    const ingestion = anyRouter.catalogIngestion as { runOnce: () => Promise<{ pages: number; items: number }> } | undefined;
    if (!ingestion) {
      res.status(400).json({ error: 'Catalog ingestion not configured' });
      return;
    }
    try {
      await services.openSearch.ensureIndexTemplate();
      const result = await ingestion.runOnce();
      res.json({ ok: true, ...result });
    } catch (e: any) {
      services.observability.recordError('catalog-reindex', e);
      res.status(500).json({ error: 'Catalog reindex failed', message: e?.message });
    }
  });

  // Admin: trigger TechDocs reindex
  router.post('/admin/reindex/techdocs', async (_req: Request, res: Response) => {
    const anyRouter = router as any;
    const ingestion = anyRouter.techdocsIngestion as { runOnce: () => Promise<{ pages: number; items: number }> } | undefined;
    if (!ingestion) {
      res.status(400).json({ error: 'TechDocs ingestion not configured' });
      return;
    }
    try {
      await services.openSearch.ensureIndexTemplate();
      const result = await ingestion.runOnce();
      res.json({ ok: true, ...result });
    } catch (e: any) {
      services.observability.recordError('techdocs-reindex', e);
      res.status(500).json({ error: 'TechDocs reindex failed', message: e?.message });
    }
  });

  // Admin: trigger APIs reindex
  router.post('/admin/reindex/apis', async (_req: Request, res: Response) => {
    const anyRouter = router as any;
    const ingestion = anyRouter.apisIngestion as { runOnce: () => Promise<{ pages: number; items: number }> } | undefined;
    if (!ingestion) {
      res.status(400).json({ error: 'APIs ingestion not configured' });
      return;
    }
    try {
      await services.openSearch.ensureIndexTemplate();
      const result = await ingestion.runOnce();
      res.json({ ok: true, ...result });
    } catch (e: any) {
      services.observability.recordError('apis-reindex', e);
      res.status(500).json({ error: 'APIs reindex failed', message: e?.message });
    }
  });

  router.post('/query', async (req: Request, res: Response) => {
    const start = Date.now();
    const { query, filters, page, pageSize } = req.body ?? {};

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Missing query string' });
      return;
    }

    const { featureToggle, openSearch, queryRewrite, reRanker, observability, embedding } = services;

    let effectiveQuery = query;
    let hints: { expandedTerms?: string[]; boostSources?: string[]; boostTags?: string[]; filterTerms?: Record<string, (string|number|boolean)[]> } | undefined;
    const timings: Record<string, number> = {};

    try {
      if (featureToggle.isRewriteEnabled() && queryRewrite) {
        const t0 = Date.now();
        const out = await queryRewrite.rewrite(query, { filters });
        effectiveQuery = out.query;
        hints = {
          expandedTerms: out.expanded,
          boostSources: out.boosts?.sources,
          boostTags: out.boosts?.tags,
          filterTerms: out.filters,
        };
        timings.rewriteMs = Date.now() - t0;
        services.observability.recordAiUsage({ stage: 'rewrite', success: true, ms: timings.rewriteMs });
      }

      // Optional semantic vector for hybrid search
      if (featureToggle.isSemanticEnabled() && embedding) {
        try {
          const vec = await embedding.embed(effectiveQuery);
          if (Array.isArray(vec) && vec.length > 0) {
            hints = { ...(hints ?? {}), queryVector: vec } as any;
          }
        } catch {
          // ignore embedding failures
        }
      }

      const t1 = Date.now();
      const searchResult = await openSearch.search(effectiveQuery, { filters, page, pageSize, hints });
      timings.searchMs = Date.now() - t1;

      let items = searchResult.items;
      if (featureToggle.isReRankEnabled() && reRanker) {
        const t2 = Date.now();
        items = await reRanker.reRank(effectiveQuery, items, {
          intent: undefined, // optional; provider may not need explicit intents
          boosts: { sources: hints?.boostSources, tags: hints?.boostTags },
        });
        timings.rerankMs = Date.now() - t2;
        services.observability.recordAiUsage({ stage: 'rerank', success: true, ms: timings.rerankMs });
      }

      const totalMs = Date.now() - start;
      const basePayload = { results: items, total: searchResult.total, timings: { ...timings, totalMs } } as any;
      observability.recordQuery({ query, effectiveQuery, timings: { ...timings, totalMs } });
      if (observability && (observability as any).recordDiagnostic) {
        const diag = { q: query, q_eff: effectiveQuery, totalMs, counts: items.length, boosted: { src: hints?.boostSources, tags: hints?.boostTags } };
        observability.recordDiagnostic(diag);
        // Include diagnostic in response if sampled logs enabled
        if ((observability as any).sampleRate && (observability as any).sampleRate > 0) {
          basePayload.diagnostic = diag;
        }
      }
      res.json(basePayload);
    } catch (e: any) {
      observability.recordError('query', e);
      // If failure happened during rewrite/rerank, record AI failure
      if (timings.rewriteMs === undefined && featureToggle.isRewriteEnabled()) {
        services.observability.recordAiUsage({ stage: 'rewrite', success: false });
      }
      if (timings.rerankMs === undefined && featureToggle.isReRankEnabled()) {
        services.observability.recordAiUsage({ stage: 'rerank', success: false });
      }
      res.status(500).json({ error: 'Query failed', message: e?.message });
    }
  });

  return router;
}
