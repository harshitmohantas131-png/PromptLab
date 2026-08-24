import { LLMProvider } from '../providers/llm.provider.js';

export interface PromptExecutionResult {
  output: string;
  metadata: {
    model: string;
    latencyMs: number;
    timestamp: string;
  };
}

export class PromptService {
  constructor(private provider: LLMProvider) {}

  async execute(prompt: string): Promise<PromptExecutionResult> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    const output = await this.provider.generate(prompt);

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      output,
      metadata: {
        model: this.provider.model,
        latencyMs,
        timestamp,
      },
    };
  }
}
