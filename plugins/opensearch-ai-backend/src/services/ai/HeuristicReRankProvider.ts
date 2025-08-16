import type { SearchItem } from '../OpenSearchClient';
import type { ReRankProvider, ReRankContext } from './ReRankProvider';

export class HeuristicReRankProvider implements ReRankProvider {
  constructor(private readonly options: { freshnessDays?: number } = {}) {}

  async reRank(query: string, items: SearchItem[], ctx?: ReRankContext): Promise<SearchItem[]> {
    const q = query.toLowerCase();
    const now = Date.now();
    const maxAgeMs = (this.options.freshnessDays ?? 30) * 24 * 60 * 60 * 1000;
    const boostSources = new Set((ctx?.boosts?.sources ?? []).map(s => s.toLowerCase()));
    const boostTags = new Set((ctx?.boosts?.tags ?? []).map(t => t.toLowerCase()));

    function textify(it: SearchItem) {
      return (
        (it.title ?? '') + ' ' + (it.text ?? '') + ' ' + (Array.isArray((it.fields as any)?.tags) ? ((it.fields as any).tags as string[]).join(' ') : '')
      ).toLowerCase();
    }

    const scored = items.map((it, idx) => {
      let score = it.score ?? 0;
      const t = textify(it);

      // Exact term bonuses
      if (t.includes(q)) score += 0.5;
      // Title contains query
      if ((it.title ?? '').toLowerCase().includes(q)) score += 0.75;

      // Source boosts
      const src = (it.source ?? '').toLowerCase();
      if (src && boostSources.has(src)) score += 0.8;

      // Tag boosts
      const tags: string[] = Array.isArray((it.fields as any)?.tags) ? ((it.fields as any).tags as string[]) : [];
      if (tags.some(tg => boostTags.has(String(tg).toLowerCase()))) score += 0.6;

      // Freshness boost if updated recently
      const updatedAt = (it.fields as any)?.updated_at;
      if (updatedAt) {
        const ts = Date.parse(String(updatedAt));
        if (!Number.isNaN(ts)) {
          const age = now - ts;
          if (age >= 0 && age < maxAgeMs) {
            // Linear decay over freshness window
            const freshness = 1 - age / maxAgeMs;
            score += 0.5 * freshness;
          }
        }
      }

      // Stable tie-breaker using original order
      return { it, score: score + idx * 1e-6 };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => ({ ...s.it, score: s.score }));
  }
}

