import { randomUUID } from 'node:crypto';

export interface Criterion {
  name: string;
  score: number;
}

export interface EvaluationRecord {
  id: string;
  executionId: string;
  criteria: Criterion[];
  overallScore: number;
  createdAt: string;
}

export class EvaluationStore {
  private evaluations: EvaluationRecord[] = [];

  addOrUpdate(data: {
    executionId: string;
    criteria: Criterion[];
    overallScore: number;
  }): { record: EvaluationRecord; isCreated: boolean } {
    const existingIndex = this.evaluations.findIndex(
      (e) => e.executionId === data.executionId
    );

    if (existingIndex !== -1) {
      // Update existing evaluation while preserving its ID
      const existing = this.evaluations[existingIndex];
      const updatedRecord: EvaluationRecord = {
        id: existing.id,
        executionId: data.executionId,
        criteria: data.criteria,
        overallScore: data.overallScore,
        createdAt: new Date().toISOString(),
      };
      this.evaluations[existingIndex] = updatedRecord;
      return { record: updatedRecord, isCreated: false };
    }

    // First evaluation for this execution
    const newRecord: EvaluationRecord = {
      id: randomUUID(),
      executionId: data.executionId,
      criteria: data.criteria,
      overallScore: data.overallScore,
      createdAt: new Date().toISOString(),
    };
    this.evaluations.unshift(newRecord);
    return { record: newRecord, isCreated: true };
  }

  getAll(): EvaluationRecord[] {
    return [...this.evaluations];
  }

  getByExecutionId(executionId: string): EvaluationRecord | undefined {
    return this.evaluations.find((e) => e.executionId === executionId);
  }

  clear(): number {
    const clearedCount = this.evaluations.length;
    this.evaluations = [];
    return clearedCount;
  }
}

export const evaluationStore = new EvaluationStore();
