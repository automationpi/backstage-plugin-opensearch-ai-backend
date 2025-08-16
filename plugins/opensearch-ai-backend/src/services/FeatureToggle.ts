export class FeatureToggle {
  constructor(
    private readonly flags: {
      rewrite?: boolean;
      rerank?: boolean;
      semantic?: boolean;
    } = {},
  ) {}

  isRewriteEnabled() {
    return !!this.flags.rewrite;
  }

  isReRankEnabled() {
    return !!this.flags.rerank;
  }

  isSemanticEnabled() {
    return !!this.flags.semantic;
  }
}

