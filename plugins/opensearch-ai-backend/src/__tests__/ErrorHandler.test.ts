import { ErrorHandler, CircuitBreaker, CircuitBreakerState } from '../services/ErrorHandler';

describe('ErrorHandler', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await ErrorHandler.withRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const result = await ErrorHandler.withRetry(operation, { retries: 3, minTimeout: 1 });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('persistent failure'));
      
      await expect(
        ErrorHandler.withRetry(operation, { retries: 2, minTimeout: 1 })
      ).rejects.toThrow('persistent failure');
      
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable network errors', () => {
      expect(ErrorHandler.isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(ErrorHandler.isRetryableError({ code: 'ENOTFOUND' })).toBe(true);
      expect(ErrorHandler.isRetryableError({ code: 'TIMEOUT' })).toBe(true);
    });

    it('should identify retryable HTTP status codes', () => {
      expect(ErrorHandler.isRetryableError({ status: 408 })).toBe(true); // Request Timeout
      expect(ErrorHandler.isRetryableError({ status: 429 })).toBe(true); // Too Many Requests
      expect(ErrorHandler.isRetryableError({ status: 500 })).toBe(true); // Internal Server Error
      expect(ErrorHandler.isRetryableError({ status: 502 })).toBe(true); // Bad Gateway
      expect(ErrorHandler.isRetryableError({ status: 503 })).toBe(true); // Service Unavailable
      expect(ErrorHandler.isRetryableError({ status: 504 })).toBe(true); // Gateway Timeout
    });

    it('should identify non-retryable errors', () => {
      expect(ErrorHandler.isRetryableError({ status: 400 })).toBe(false); // Bad Request
      expect(ErrorHandler.isRetryableError({ status: 401 })).toBe(false); // Unauthorized
      expect(ErrorHandler.isRetryableError({ status: 404 })).toBe(false); // Not Found
      expect(ErrorHandler.isRetryableError({ code: 'SOME_OTHER_ERROR' })).toBe(false);
    });

    it('should identify retryable OpenAI errors', () => {
      expect(ErrorHandler.isRetryableError({ type: 'insufficient_quota' })).toBe(true);
      expect(ErrorHandler.isRetryableError({ type: 'server_error' })).toBe(true);
      expect(ErrorHandler.isRetryableError({ type: 'invalid_request' })).toBe(false);
    });
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 100,
      monitoringPeriodMs: 50,
    });
  });

  describe('CLOSED state', () => {
    it('should execute operations when closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Execute until threshold is reached
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch {
          // Expected
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.getFailureCount()).toBe(3);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Force circuit breaker to OPEN state
      const failingOperation = jest.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch {
          // Expected
        }
      }
    });

    it('should reject operations immediately when open', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const operation = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Force to OPEN state
      const failingOperation = jest.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch {
          // Expected
        }
      }
      
      // Wait for reset timeout to enable HALF_OPEN transition
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    it('should transition to CLOSED on successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(operation);
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should transition back to OPEN on failed operation', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('still failing'));
      
      try {
        await circuitBreaker.execute(operation);
      } catch {
        // Expected
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });
});