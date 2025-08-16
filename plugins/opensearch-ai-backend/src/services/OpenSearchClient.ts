export type SearchOptions = {
  filters?: Record<string, unknown>;
  page?: number;
  pageSize?: number;
  hints?: {
    expandedTerms?: string[];
    boostSources?: string[];
    boostTags?: string[];
    filterTerms?: Record<string, (string | number | boolean)[]>;
    queryVector?: number[];
  };
};

export type SearchItem = {
  title: string;
  url?: string;
  text?: string;
  score?: number;
  source?: string;
  fields?: Record<string, unknown>;
};

export type SearchResponse = {
  items: SearchItem[];
  total: number;
};

export type IndexedDoc = {
  id?: string;
  title: string;
  text?: string;
  url?: string;
  tags?: string[];
  kind?: string;
  namespace?: string;
  owner?: string;
  system?: string;
  lifecycle?: string;
  source?: string; // catalog | techdocs | apis | other
  [key: string]: unknown;
};

type ClientConfig = {
  hosts: string[];
  indexPrefix?: string;
  auth?: { type?: 'basic' | 'bearer'; username?: string; password?: string; token?: string };
  tls?: { rejectUnauthorized?: boolean };
  ranking?: { sourceWeight?: number; tagWeight?: number };
  vector?: { enabled?: boolean; dim?: number };
};

export class OpenSearchClient {
  constructor(private readonly config: ClientConfig) {}

  private pickHost(): URL {
    const host = this.config.hosts[0];
    return new URL(host);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const auth = this.config.auth;
    if (auth?.type === 'basic' && auth.username && auth.password) {
      const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['authorization'] = `Basic ${token}`;
    } else if (auth?.type === 'bearer' && auth.token) {
      headers['authorization'] = `Bearer ${auth.token}`;
    }
    return headers;
  }

  private async request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const url = this.pickHost();
    url.pathname = path;

    const isHttps = url.protocol === 'https:';
    const httpLib = isHttps ? await import('https') : await import('http');

    const payload = body ? JSON.stringify(body) : undefined;
    const headers = this.buildHeaders();
    if (payload) headers['content-length'] = Buffer.byteLength(payload).toString();

    const agentOptions: any = {};
    if (isHttps && this.config.tls?.rejectUnauthorized === false) {
      agentOptions.rejectUnauthorized = false;
    }
    const agent = isHttps ? new httpLib.Agent(agentOptions) : new httpLib.Agent();

    return new Promise<T>((resolve, reject) => {
      const req = httpLib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers,
          agent,
        },
        (res: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (d: any) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(raw));
              } catch (e) {
                // @ts-ignore
                resolve(raw as unknown as T);
              }
            } else {
              reject(new Error(`OpenSearch HTTP ${res.statusCode}: ${raw}`));
            }
          });
        },
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  private async requestRaw(path: string, method: 'POST', body: string, headers?: Record<string, string>): Promise<any> {
    const url = this.pickHost();
    url.pathname = path;

    const isHttps = url.protocol === 'https:';
    const httpLib = isHttps ? await import('https') : await import('http');

    const finalHeaders: Record<string, string> = {
      ...(headers ?? {}),
      ...(this.buildHeaders()),
    };
    finalHeaders['content-length'] = Buffer.byteLength(body).toString();

    const agentOptions: any = {};
    if (isHttps && this.config.tls?.rejectUnauthorized === false) {
      agentOptions.rejectUnauthorized = false;
    }
    const agent = isHttps ? new httpLib.Agent(agentOptions) : new httpLib.Agent();

    return new Promise((resolve, reject) => {
      const req = httpLib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers: finalHeaders,
          agent,
        },
        (res: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (d: any) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(raw));
              } catch {
                resolve(raw);
              }
            } else {
              reject(new Error(`OpenSearch HTTP ${res.statusCode}: ${raw}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const from = Math.max(0, ((options.page ?? 0) as number) * (options.pageSize ?? 20));
    const size = options.pageSize ?? 20;
    const expanded = options.hints?.expandedTerms ?? [];
    const finalQuery = expanded.length ? `${query} OR ${expanded.join(' OR ')}` : query;
    const mustQuery: any = {
      simple_query_string: {
        query: finalQuery,
        default_operator: 'and',
        fields: ['title^3', 'text^1', 'tags^2'],
      },
    };

    const should: any[] = [];
    const sourceWeight = this.config.ranking?.sourceWeight ?? 2.0;
    for (const s of options.hints?.boostSources ?? []) {
      should.push({ term: { source: { value: s, boost: sourceWeight } } });
    }
    const tagWeight = this.config.ranking?.tagWeight ?? 1.5;
    for (const t of options.hints?.boostTags ?? []) {
      should.push({ term: { 'tags': { value: t, boost: tagWeight } } });
    }

    const filter: any[] = [];
    const baseFilters = options.filters ?? {};
    for (const [k, v] of Object.entries(baseFilters)) {
      filter.push({ term: { [k]: v } });
    }
    for (const [k, vs] of Object.entries(options.hints?.filterTerms ?? {})) {
      filter.push({ terms: { [k]: vs } });
    }

    let q: any;
    if (options.hints?.queryVector && Array.isArray(options.hints.queryVector) && options.hints.queryVector.length > 0) {
      // Vector branch: k-NN with optional filters. Combine with text via rescoring later if needed.
      q = {
        size,
        query: { bool: { filter } },
        knn: {
          field: 'embedding',
          query_vector: options.hints.queryVector,
          k: size,
          num_candidates: Math.max(100, size * 2),
        },
        highlight: { fields: { text: {} } },
      };
    } else {
      q = {
        query: should.length || filter.length ? { bool: { must: mustQuery, should, filter } } : mustQuery,
        from,
        size,
        highlight: { fields: { text: {} } },
      } as any;
    }

    // Basic filtering (term filters only for now)
    // already applied filters in bool above

    // Use a default index alias
    const index = `${this.config.indexPrefix ?? 'backstage'}-*`;

    try {
      const response: any = await this.request(`/${index}/_search`, 'POST', q);
      const items: SearchItem[] = (response.hits?.hits ?? []).map((h: any) => ({
        title: h._source?.title ?? h._source?.name ?? 'Untitled',
        url: h._source?.location ?? h._source?.url,
        text: h.highlight?.text?.join(' ') ?? h._source?.text,
        score: h._score,
        source: h._index,
        fields: h._source,
      }));
      const total = typeof response.hits?.total === 'object' ? response.hits.total.value : response.hits?.total ?? items.length;
      return { items, total };
    } catch (_e) {
      // On connectivity errors, return empty results to avoid hard failures in early stages
      return { items: [], total: 0 };
    }
  }

  async indexDocuments(_docs: unknown[]): Promise<void> {
    // TODO: Implement bulk indexing
  }

  async ensureIndexTemplate(): Promise<void> {
    const name = `${this.config.indexPrefix ?? 'backstage'}-template`;
    const pattern = `${this.config.indexPrefix ?? 'backstage'}-*`;
    const template = {
      index_patterns: [pattern],
      template: {
        settings: {
          number_of_shards: 1,
          'index.knn': true,
          analysis: {
            analyzer: {
              default: { type: 'standard' },
            },
          },
        },
        mappings: {
          dynamic: 'false',
          properties: {
            title: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
            text: { type: 'text' },
            url: { type: 'keyword' },
            tags: { type: 'keyword' },
            kind: { type: 'keyword' },
            namespace: { type: 'keyword' },
            owner: { type: 'keyword' },
            system: { type: 'keyword' },
            lifecycle: { type: 'keyword' },
            source: { type: 'keyword' },
            updated_at: { type: 'date' },
            embedding: this.config.vector?.enabled
              ? { type: 'knn_vector', dimension: this.config.vector?.dim ?? 384, method: { name: 'hnsw', engine: 'lucene', space_type: 'cosinesimil' } }
              : undefined,
          },
        },
      },
      priority: 100,
      _meta: { managed_by: 'backstage-opensearch-ai' },
    };
    await this.request(`/_index_template/${encodeURIComponent(name)}`, 'POST', template);
  }

  async bulkIndex(source: string, docs: IndexedDoc[]): Promise<{ indexed: number }> {
    const index = `${this.config.indexPrefix ?? 'backstage'}-${source}`;
    if (!Array.isArray(docs) || docs.length === 0) return { indexed: 0 };
    const lines: string[] = [];
    for (const d of docs) {
      const action: any = { index: { _index: index } };
      if (d.id) action.index._id = d.id;
      lines.push(JSON.stringify(action));
      const doc = { ...d, source, updated_at: new Date().toISOString() };
      lines.push(JSON.stringify(doc));
    }
    const body = lines.join('\n') + '\n';
    await this.requestRaw('/_bulk', 'POST', body, { 'content-type': 'application/x-ndjson' });
    return { indexed: docs.length };
  }
}
