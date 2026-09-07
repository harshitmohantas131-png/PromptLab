import { randomUUID } from 'node:crypto';
import { PromptExecutionResult } from './prompt.service.js';

export interface ExecutionRecord extends PromptExecutionResult {
  id: string;
}

export class ExecutionStore {
  private executions: ExecutionRecord[] = [];

  add(result: PromptExecutionResult): ExecutionRecord {
    const record: ExecutionRecord = {
      id: randomUUID(),
      ...result,
    };
    this.executions.unshift(record);
    return record;
  }

  getAll(): ExecutionRecord[] {
    return [...this.executions];
  }

  getById(id: string): ExecutionRecord | undefined {
    return this.executions.find((e) => e.id === id);
  }

  clear(): number {
    const clearedCount = this.executions.length;
    this.executions = [];
    return clearedCount;
  }
}

export const executionStore = new ExecutionStore();
