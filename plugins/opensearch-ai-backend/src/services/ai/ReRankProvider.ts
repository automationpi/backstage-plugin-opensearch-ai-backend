import type { SearchItem } from '../OpenSearchClient';

export type ReRankContext = {
  intent?: string[];
  boosts?: { sources?: string[]; tags?: string[] };
};

export interface ReRankProvider {
  reRank(query: string, items: SearchItem[], ctx?: ReRankContext): Promise<SearchItem[]>;
}

