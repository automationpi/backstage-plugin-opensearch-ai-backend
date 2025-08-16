import type { SearchItem } from './OpenSearchClient';
import type { ReRankProvider, ReRankContext } from './ai/ReRankProvider';

export class ReRankerService {
  constructor(
    private readonly options: { enabled: boolean; timeoutMs?: number; topK?: number },
    private readonly provider?: ReRankProvider,
  ) {}

  isEnabled() {
    return !!this.options.enabled && !!this.provider;
  }

  async reRank(query: string, items: SearchItem[], ctx?: ReRankContext): Promise<SearchItem[]> {
    if (!this.isEnabled()) return items;
    const topK = Math.min(this.options.topK ?? 50, items.length);
    const head = items.slice(0, topK);
    const tail = items.slice(topK);
    const p = this.provider!.reRank(query, head, ctx);

    try {
      if (this.options.timeoutMs && this.options.timeoutMs > 0) {
        const timeout = new Promise<SearchItem[]>((_resolve, reject) =>
          setTimeout(() => reject(new Error('rerank timeout')), this.options.timeoutMs),
        );
        const reranked = await Promise.race([p, timeout]);
        return [...reranked, ...tail];
      }
      const reranked = await p;
      return [...reranked, ...tail];
    } catch {
      return items; // safe fallback
    }
  }
}
