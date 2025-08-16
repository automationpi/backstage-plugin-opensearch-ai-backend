import { CatalogIndexer } from '../indexers/CatalogIndexer';
import type { CatalogProvider } from '../types/Backstage';
import type { Observability } from '../services/Observability';

export class CatalogIngestion {
  constructor(
    private readonly provider: CatalogProvider,
    private readonly indexer: CatalogIndexer,
    private readonly observability: Observability,
    private readonly pageSize: number = 500,
  ) {}

  async runOnce(): Promise<{ pages: number; items: number }> {
    let after: string | null | undefined = null;
    let pages = 0;
    let total = 0;
    do {
      const page = await this.provider.fetchEntities({ after, limit: this.pageSize });
      const items = page.items ?? [];
      if (items.length > 0) {
        const res = await this.indexer.index(items as any[]);
        total += res.indexed;
      }
      pages += 1;
      after = page.nextPageCursor;
    } while (after);

    this.observability.recordIndexing({ source: 'catalog', pages, items: total });
    return { pages, items: total };
  }
}

