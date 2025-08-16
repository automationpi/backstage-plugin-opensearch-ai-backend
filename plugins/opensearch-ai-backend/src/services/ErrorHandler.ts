import pRetry from 'p-retry';

export type RetryConfig = {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
};

export type CircuitBreakerConfig = {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  monitoringPeriodMs?: number;
};

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(private config: Required<CircuitBreakerConfig>) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - operation not allowed');
      }
      // Try to transition to HALF_OPEN
      this.state = CircuitBreakerState.HALF_OPEN;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}

export class ErrorHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = {},
    operationName?: string,
  ): Promise<T> {
    const retryConfig = {
      retries: config.retries ?? 3,
      minTimeout: config.minTimeout ?? 1000,
      maxTimeout: config.maxTimeout ?? 5000,
      factor: config.factor ?? 2,
      onFailedAttempt: (error: any) => {
        console.warn(
          `${operationName || 'Operation'} attempt ${error.attemptNumber} failed: ${error.message}. ${
            error.retriesLeft > 0 ? `Retrying in ${error.delay}ms...` : 'No more retries.'
          }`,
        );
      },
    };

    return pRetry(operation, retryConfig);
  }

  static isRetryableError(error: any): boolean {
    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'TIMEOUT') {
      return true;
    }

    // HTTP status codes that are retryable
    if (error.status) {
      const retryableStatuses = [408, 429, 500, 502, 503, 504];
      return retryableStatuses.includes(error.status);
    }

    // OpenAI specific errors
    if (error.type === 'insufficient_quota' || error.type === 'server_error') {
      return true;
    }

    return false;
  }

  static createRetryConfig(isRetryable: (error: any) => boolean): RetryConfig & { shouldRetry: (error: any) => boolean } {
    return {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2,
      shouldRetry: isRetryable,
    };
  }
}