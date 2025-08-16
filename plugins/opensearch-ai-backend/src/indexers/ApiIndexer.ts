import type { IndexedDoc } from '../services/OpenSearchClient';
import { OpenSearchClient } from '../services/OpenSearchClient';

export class ApiIndexer {
  constructor(private readonly client: OpenSearchClient) {}

  async index(apis: Array<{ name: string; description?: string; url?: string; tags?: string[] }>): Promise<{ indexed: number }> {
    const docs: IndexedDoc[] = apis.map(a => ({
      title: a.name,
      text: a.description,
      url: a.url,
      tags: a.tags,
      kind: 'API',
    }));
    return this.client.bulkIndex('apis', docs);
  }
}

