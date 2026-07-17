export interface GenerateRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

/** A model that generates code for a task. The "agent under test." */
export interface ModelAdapter {
  /** the model id, used as the scorecard column name */
  id: string;
  generate(req: GenerateRequest): Promise<string>;
}
