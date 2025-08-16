import { TechDocsIndexer } from '../indexers/TechDocsIndexer';
import type { Observability } from '../services/Observability';
import type { TechDocsProvider } from '../types/Backstage';

export class TechDocsIngestion {
  constructor(
    private readonly provider: TechDocsProvider,
    private readonly indexer: TechDocsIndexer,
    private readonly observability: Observability,
    private readonly pageSize: number = 500,
  ) {}

  async runOnce(): Promise<{ pages: number; items: number }> {
    let after: string | null | undefined = null;
    let pages = 0;
    let total = 0;
    do {
      const page = await this.provider.fetchPages({ after, limit: this.pageSize });
      const items = page.items ?? [];
      if (items.length > 0) {
        const res = await this.indexer.index(items as any[]);
        total += res.indexed;
      }
      pages += 1;
      after = page.nextPageCursor;
    } while (after);

    this.observability.recordIndexing({ source: 'techdocs', pages, items: total });
    return { pages, items: total };
  }
}

