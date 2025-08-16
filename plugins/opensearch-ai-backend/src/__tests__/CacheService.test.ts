import { InMemoryCacheService } from '../services/CacheService';

describe('InMemoryCacheService', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService({ defaultTtlSeconds: 1 });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      expect(cache.del('key1')).toBe(1);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire values after TTL', async () => {
      cache.set('key1', 'value1', 0.1); // 100ms TTL
      expect(cache.get('key1')).toBe('value1');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should use default TTL when not specified', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      
      // Should still be there before default TTL
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');
      
      // Hit
      cache.get('key1');
      // Miss
      cache.get('nonexistent');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.keys).toBe(1);
    });
  });

  describe('static helper methods', () => {
    it('should create rewrite cache keys', () => {
      const key1 = InMemoryCacheService.createRewriteKey('query1');
      const key2 = InMemoryCacheService.createRewriteKey('query1', { filter: 'value' });
      const key3 = InMemoryCacheService.createRewriteKey('query2');
      
      expect(key1).toContain('rewrite:');
      expect(key1).not.toBe(key2); // Different filters
      expect(key1).not.toBe(key3); // Different queries
    });

    it('should create embedding cache keys', () => {
      const key1 = InMemoryCacheService.createEmbeddingKey('text1');
      const key2 = InMemoryCacheService.createEmbeddingKey('text2');
      
      expect(key1).toContain('embedding:');
      expect(key1).not.toBe(key2);
    });
  });

  describe('object storage', () => {
    it('should store and retrieve complex objects', () => {
      const obj = { 
        query: 'test', 
        results: [1, 2, 3], 
        metadata: { score: 0.95 } 
      };
      
      cache.set('complex', obj);
      const retrieved = cache.get('complex');
      
      expect(retrieved).toEqual(obj);
    });
  });
});