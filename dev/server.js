let express;
try { express = require('express'); } catch (e) {
  // Fallback to plugin-local express
  express = require('../plugins/opensearch-ai-backend/node_modules/express');
}
const { createRouterFromConfig } = require('../plugins/opensearch-ai-backend/dist/index.js');

async function main() {
  const app = express();
  app.use(express.json());

  const router = createRouterFromConfig({
    opensearch: {
      hosts: ['http://localhost:9200'],
      indexPrefix: 'backstage',
      tls: { rejectUnauthorized: false },
    },
    ai: {
      enabled: true,
      provider: 'openai',
      model: 'gpt-4o-mini',
      features: { rewrite: true, rerank: true, semantic: false },
      budgets: { rewriteMs: 120, rerankMs: 80 },
      privacy: { redactEmails: true, redactTokens: true },
      limits: { rerankTopK: 50 },
      synonyms: { api: ['openapi', 'swagger'] },
    },
    ranking: { boosts: { sourceWeight: 2.0, tagWeight: 1.5 } },
    observability: { sampleRate: 0 },
  });

  app.use('/api/opensearch-ai', router);
  const port = process.env.PORT || 7007;
  app.listen(port, () => console.log(`Dev server listening on :${port}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
