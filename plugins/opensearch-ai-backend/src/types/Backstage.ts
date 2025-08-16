// Minimal Backstage-like types (loose) to avoid external deps
export type Entity = {
  kind?: string;
  metadata?: {
    uid?: string;
    name?: string;
    title?: string;
    namespace?: string;
    description?: string;
    tags?: string[];
    annotations?: Record<string, string>;
    owner?: string;
  };
  spec?: Record<string, any> & {
    description?: string;
    owner?: string;
    system?: string;
    lifecycle?: string;
  };
};

export type CatalogPage = { items: Entity[]; nextPageCursor?: string | null };

export interface CatalogProvider {
  fetchEntities(page?: { after?: string | null; limit?: number }): Promise<CatalogPage>;
}

export type TechDocsPage = {
  title: string;
  url: string;
  text?: string;
  tags?: string[];
};

export interface TechDocsProvider {
  fetchPages(page?: { after?: string | null; limit?: number }): Promise<{ items: TechDocsPage[]; nextPageCursor?: string | null }>;
}

export type ApiItem = {
  name: string;
  description?: string;
  url?: string;
  tags?: string[];
};

export interface ApiProvider {
  fetchApis(page?: { after?: string | null; limit?: number }): Promise<{ items: ApiItem[]; nextPageCursor?: string | null }>;
}
