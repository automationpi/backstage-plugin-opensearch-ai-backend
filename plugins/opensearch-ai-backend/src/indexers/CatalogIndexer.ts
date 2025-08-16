import type { IndexedDoc } from '../services/OpenSearchClient';
import { OpenSearchClient } from '../services/OpenSearchClient';

export class CatalogIndexer {
  constructor(private readonly client: OpenSearchClient) {}

  async index(entities: any[]): Promise<{ indexed: number }> {
    const docs: IndexedDoc[] = entities.map(e => {
      const metadata = e?.metadata ?? {};
      const spec = e?.spec ?? {};
      return {
        id: metadata.uid || metadata.name,
        title: metadata.title || metadata.name || 'untitled',
        text: metadata.description || spec.description || '',
        url: metadata.annotations?.['backstage.io/view-url'] || metadata.annotations?.['backstage.io/edit-url'],
        tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        kind: e?.kind,
        namespace: metadata.namespace || 'default',
        owner: metadata.owner || spec.owner,
        system: spec.system,
        lifecycle: spec.lifecycle,
      } as IndexedDoc;
    });
    return this.client.bulkIndex('catalog', docs);
  }
}

