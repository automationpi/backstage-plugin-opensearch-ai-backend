import NodeCache from 'node-cache';

export interface CacheService {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlSeconds?: number): boolean;
  del(key: string): number;
  clear(): void;
  getStats(): { keys: number; hits: number; misses: number };
}

export class InMemoryCacheService implements CacheService {
  private cache: NodeCache;

  constructor(options: { defaultTtlSeconds?: number; checkPeriodSeconds?: number } = {}) {
    this.cache = new NodeCache({
      stdTTL: options.defaultTtlSeconds ?? 300, // 5 minutes default
      checkperiod: options.checkPeriodSeconds ?? 60, // Check for expired keys every minute
      useClones: false, // Better performance, but be careful with object mutations
    });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttlSeconds?: number): boolean {
    if (ttlSeconds !== undefined) {
      return this.cache.set(key, value, ttlSeconds);
    }
    return this.cache.set(key, value);
  }

  del(key: string): number {
    return this.cache.del(key);
  }

  clear(): void {
    this.cache.flushAll();
  }

  getStats(): { keys: number; hits: number; misses: number } {
    const stats = this.cache.getStats();
    return {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
    };
  }

  // Create cache key for query rewrite results
  static createRewriteKey(query: string, filters?: Record<string, unknown>): string {
    const filterStr = filters ? JSON.stringify(filters) : '';
    return `rewrite:${Buffer.from(query + filterStr).toString('base64')}`;
  }

  // Create cache key for embedding results
  static createEmbeddingKey(text: string): string {
    return `embedding:${Buffer.from(text).toString('base64')}`;
  }
}