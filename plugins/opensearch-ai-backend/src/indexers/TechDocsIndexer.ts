import type { IndexedDoc } from '../services/OpenSearchClient';
import { OpenSearchClient } from '../services/OpenSearchClient';

export class TechDocsIndexer {
  constructor(private readonly client: OpenSearchClient) {}

  async index(pages: Array<{ title: string; url: string; text?: string; tags?: string[] }>): Promise<{ indexed: number }> {
    const docs: IndexedDoc[] = pages.map(p => ({
      title: p.title,
      url: p.url,
      text: p.text,
      tags: p.tags,
    }));
    return this.client.bulkIndex('techdocs', docs);
  }
}

