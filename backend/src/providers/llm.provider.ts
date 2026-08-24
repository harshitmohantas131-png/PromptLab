export interface LLMProvider {
  readonly model: string;
  generate(prompt: string): Promise<string>;
}
