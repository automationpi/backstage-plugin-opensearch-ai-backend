export type RewriteInput = {
  query: string;
  context?: Record<string, unknown>;
  filters?: Record<string, unknown>;
};

export type RewriteOutput = {
  query: string;
  intent?: string[];
  expanded?: string[]; // additional terms/phrases to OR into query
  boosts?: { sources?: string[]; tags?: string[] };
  filters?: Record<string, (string | number | boolean)[]>;
};

export interface AiProvider {
  rewrite(input: RewriteInput): Promise<RewriteOutput>;
  health?(): Promise<boolean>;
}
