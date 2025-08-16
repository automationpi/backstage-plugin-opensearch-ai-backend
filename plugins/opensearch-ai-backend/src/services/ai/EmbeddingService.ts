import OpenAI from 'openai';
import { ErrorHandler, CircuitBreaker } from '../ErrorHandler';
import type { CacheService } from '../CacheService';

export interface EmbeddingService {
  dim(): number;
  embed(text: string): Promise<number[]>;
  health(): Promise<boolean>;
}

export class OpenAIEmbeddingService implements EmbeddingService {
  private openai: OpenAI;
  private circuitBreaker: CircuitBreaker;

  constructor(
    private readonly options: {
      apiKey: string;
      model?: string;
      endpoint?: string;
      dimension?: number;
    },
    private readonly cache?: CacheService,
  ) {
    this.openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.endpoint,
    });

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 30000, // 30 seconds
      monitoringPeriodMs: 5000, // 5 seconds
    });
  }

  dim(): number {
    return this.options.dimension ?? 1536; // text-embedding-3-small default
  }

  async embed(text: string): Promise<number[]> {
    // Check cache first
    if (this.cache) {
      const cacheKey = `embedding:${Buffer.from(text).toString('base64')}`;
      const cached = this.cache.get<number[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await this.circuitBreaker.execute(async () => {
      return await this.performEmbedding(text);
    });

    // Cache the result for a longer time since embeddings are stable
    if (this.cache) {
      const cacheKey = `embedding:${Buffer.from(text).toString('base64')}`;
      this.cache.set(cacheKey, result, 3600); // Cache for 1 hour
    }

    return result;
  }

  private async performEmbedding(text: string): Promise<number[]> {
    return await ErrorHandler.withRetry(
      async () => {
        const response = await this.openai.embeddings.create({
          model: this.options.model ?? 'text-embedding-3-small',
          input: text.slice(0, 8000), // Limit input length to avoid token limits
        });

        const embedding = response.data[0]?.embedding;
        if (!embedding || !Array.isArray(embedding)) {
          throw new Error('Invalid embedding response from OpenAI');
        }

        return embedding;
      },
      {
        retries: 2,
        minTimeout: 1000,
        maxTimeout: 3000,
      },
      'OpenAI embedding',
    );
  }

  async health(): Promise<boolean> {
    try {
      // Test with a simple embedding
      await this.performEmbedding('test');
      return true;
    } catch (error) {
      console.warn('OpenAI embedding health check failed:', error);
      return false;
    }
  }
}

export class NoOpEmbeddingService implements EmbeddingService {
  constructor(private readonly dimension: number = 384) {}

  dim(): number {
    return this.dimension;
  }

  async embed(text: string): Promise<number[]> {
    // Lightweight hashing into fixed-dim vector, normalized.
    const vec = new Array(this.dimension).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const idx = code % this.dimension;
      vec[idx] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  }

  async health(): Promise<boolean> {
    return true; // NoOp service is always healthy
  }
}

