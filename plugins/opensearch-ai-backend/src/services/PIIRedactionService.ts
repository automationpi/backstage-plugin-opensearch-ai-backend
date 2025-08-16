export interface IPIIRedactionService {
  redact(text: string): { redacted: string; found: string[] };
  isEnabled(): boolean;
}

export type PIIRedactionConfig = {
  redactEmails?: boolean;
  redactTokens?: boolean;
  redactIPs?: boolean;
  redactPhoneNumbers?: boolean;
  redactSSNs?: boolean;
  customPatterns?: { name: string; pattern: RegExp; replacement?: string }[];
};

export class PIIRedactionService implements IPIIRedactionService {
  private patterns: { name: string; pattern: RegExp; replacement: string }[] = [];

  constructor(private config: PIIRedactionConfig) {
    this.initializePatterns();
  }

  private initializePatterns(): void {
    if (this.config.redactEmails ?? true) {
      this.patterns.push({
        name: 'email',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '[EMAIL]',
      });
    }

    if (this.config.redactTokens ?? true) {
      // Common token patterns
      this.patterns.push(
        {
          name: 'bearer_token',
          pattern: /\b[Bb]earer\s+[A-Za-z0-9\-_\.]+/g,
          replacement: 'Bearer [TOKEN]',
        },
        {
          name: 'api_key',
          pattern: /\b(?:api[_-]?key|apikey|token)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{20,}['"]?/gi,
          replacement: 'api_key=[TOKEN]',
        },
        {
          name: 'aws_access_key',
          pattern: /\bAKIA[0-9A-Z]{16}\b/g,
          replacement: '[AWS_ACCESS_KEY]',
        },
        {
          name: 'github_token',
          pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
          replacement: '[GITHUB_TOKEN]',
        },
        {
          name: 'jwt_token',
          pattern: /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
          replacement: '[JWT_TOKEN]',
        },
      );
    }

    if (this.config.redactIPs ?? false) {
      this.patterns.push({
        name: 'ipv4',
        pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        replacement: '[IP_ADDRESS]',
      });
    }

    if (this.config.redactPhoneNumbers ?? false) {
      this.patterns.push({
        name: 'phone_us',
        pattern: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
        replacement: '[PHONE_NUMBER]',
      });
    }

    if (this.config.redactSSNs ?? false) {
      this.patterns.push({
        name: 'ssn',
        pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        replacement: '[SSN]',
      });
    }

    // Add custom patterns
    if (this.config.customPatterns) {
      for (const custom of this.config.customPatterns) {
        this.patterns.push({
          name: custom.name,
          pattern: custom.pattern,
          replacement: custom.replacement ?? `[${custom.name.toUpperCase()}]`,
        });
      }
    }
  }

  redact(text: string): { redacted: string; found: string[] } {
    let redacted = text;
    const found: string[] = [];

    for (const { name, pattern, replacement } of this.patterns) {
      const matches = text.match(pattern);
      if (matches) {
        found.push(...matches.map(match => `${name}: ${match.substring(0, 10)}...`));
        redacted = redacted.replace(pattern, replacement);
      }
    }

    return { redacted, found };
  }

  isEnabled(): boolean {
    return this.patterns.length > 0;
  }
}

export class NoOpPIIRedactionService implements IPIIRedactionService {
  redact(text: string): { redacted: string; found: string[] } {
    return { redacted: text, found: [] };
  }

  isEnabled(): boolean {
    return false;
  }
}