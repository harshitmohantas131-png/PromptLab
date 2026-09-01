import { LLMProvider } from '../providers/llm.provider.js';

export interface PromptExecutionResult {
  prompt: string;
  resolvedPrompt: string;
  output: string;
  metadata: {
    model: string;
    latencyMs: number;
    timestamp: string;
  };
}

export class PromptService {
  constructor(private provider: LLMProvider) {}

  private extractVariables(template: string): string[] {
    const matches = template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
    const variableNames = Array.from(matches, (match) => match[1]);
    return Array.from(new Set(variableNames));
  }

  private resolveTemplate(
    template: string,
    variables: Record<string, string> = {}
  ): string {
    const referencedVars = this.extractVariables(template);

    for (const varName of referencedVars) {
      const value = variables[varName];
      if (value === undefined || value === null) {
        throw new Error(`Missing value for required variable: '${varName}'.`);
      }
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Variable '${varName}' cannot be empty or whitespace only.`);
      }
    }

    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, varName) => {
      return variables[varName].trim();
    });
  }

  async execute(
    prompt: string,
    variables: Record<string, string> = {}
  ): Promise<PromptExecutionResult> {
    const resolvedPrompt = this.resolveTemplate(prompt, variables);

    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    const output = await this.provider.generate(resolvedPrompt);

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      prompt,
      resolvedPrompt,
      output,
      metadata: {
        model: this.provider.model,
        latencyMs,
        timestamp,
      },
    };
  }
}
