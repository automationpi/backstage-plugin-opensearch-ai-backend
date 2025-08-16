import { PIIRedactionService } from '../services/PIIRedactionService';

describe('PIIRedactionService', () => {
  describe('email redaction', () => {
    it('should redact email addresses', () => {
      const service = new PIIRedactionService({ redactEmails: true });
      const result = service.redact('Contact john.doe@example.com for support');
      
      expect(result.redacted).toBe('Contact [EMAIL] for support');
      expect(result.found).toHaveLength(1);
      expect(result.found[0]).toContain('email:');
    });

    it('should not redact when disabled', () => {
      const service = new PIIRedactionService({ redactEmails: false });
      const result = service.redact('Contact john.doe@example.com for support');
      
      expect(result.redacted).toBe('Contact john.doe@example.com for support');
      expect(result.found).toHaveLength(0);
    });
  });

  describe('token redaction', () => {
    it('should redact bearer tokens', () => {
      const service = new PIIRedactionService({ redactTokens: true });
      const result = service.redact('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      
      expect(result.redacted).toContain('Bearer [TOKEN]');
      expect(result.found).toHaveLength(1);
    });

    it('should redact API keys', () => {
      const service = new PIIRedactionService({ redactTokens: true });
      const result = service.redact('api_key=sk-1234567890abcdef1234567890abcdef');
      
      expect(result.redacted).toContain('api_key=[TOKEN]');
      expect(result.found).toHaveLength(1);
    });

    it('should redact AWS access keys', () => {
      const service = new PIIRedactionService({ redactTokens: true });
      const result = service.redact('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
      
      expect(result.redacted).toContain('[AWS_ACCESS_KEY]');
      expect(result.found).toHaveLength(1);
    });

    it('should redact GitHub tokens', () => {
      const service = new PIIRedactionService({ redactTokens: true });
      const result = service.redact('GITHUB_TOKEN=ghp_1234567890abcdef1234567890abcdef123456');
      
      expect(result.redacted).toContain('[GITHUB_TOKEN]');
      expect(result.found).toHaveLength(1);
    });
  });

  describe('custom patterns', () => {
    it('should redact custom patterns', () => {
      const service = new PIIRedactionService({
        customPatterns: [
          { name: 'custom_id', pattern: /ID-\d{6}/g }
        ]
      });
      const result = service.redact('Reference ID-123456 for this case');
      
      expect(result.redacted).toBe('Reference [CUSTOM_ID] for this case');
      expect(result.found).toHaveLength(1);
    });

    it('should use custom replacement text', () => {
      const service = new PIIRedactionService({
        customPatterns: [
          { name: 'ticket', pattern: /TICKET-\d+/g, replacement: '[TICKET_ID]' }
        ]
      });
      const result = service.redact('See TICKET-12345 for details');
      
      expect(result.redacted).toBe('See [TICKET_ID] for details');
    });
  });

  describe('multiple PII types', () => {
    it('should handle multiple types in one text', () => {
      const service = new PIIRedactionService({ 
        redactEmails: true, 
        redactTokens: true 
      });
      const result = service.redact('Email user@example.com with token api_key=secret123456789');
      
      expect(result.redacted).toBe('Email [EMAIL] with token api_key=[TOKEN]');
      expect(result.found).toHaveLength(2);
    });
  });

  describe('isEnabled', () => {
    it('should return true when patterns are configured', () => {
      const service = new PIIRedactionService({ redactEmails: true });
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when no patterns are configured', () => {
      const service = new PIIRedactionService({});
      expect(service.isEnabled()).toBe(false);
    });
  });
});