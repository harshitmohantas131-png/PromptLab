import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { LLMProvider } from './providers/llm.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { PromptService } from './services/prompt.service.js';
import { executionStore } from './services/execution.store.js';
import { evaluationStore } from './services/evaluation.store.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({
  origin: FRONTEND_URL
}));
app.use(express.json());

let llmProvider: LLMProvider;
try {
  llmProvider = new GeminiProvider();
} catch (error) {
  console.warn('[PromptLab Backend] LLMProvider initialization warning:', error instanceof Error ? error.message : error);
}

const getPromptService = (): PromptService => {
  if (!llmProvider) {
    llmProvider = new GeminiProvider();
  }
  return new PromptService(llmProvider);
};

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'PromptLab API is healthy'
  });
});

// L1.4 Application Feature: Prompt Execution with Template Variables
// L2.1 Execution History: Stores successful execution in-memory with unique ID
app.post('/api/prompts/execute', async (req: Request, res: Response) => {
  const { prompt, variables } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({
      error: "Invalid request: 'prompt' must be a non-empty string."
    });
  }

  if (
    variables !== undefined &&
    (typeof variables !== 'object' || variables === null || Array.isArray(variables))
  ) {
    return res.status(400).json({
      error: "Invalid request: 'variables' must be an object."
    });
  }

  try {
    const promptService = getPromptService();
    const result = await promptService.execute(prompt.trim(), variables);
    const executionRecord = executionStore.add(result);
    return res.status(200).json(executionRecord);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Prompt execution failed.';
    console.error('[Prompt Execution Error]:', errorMessage);

    if (
      errorMessage.startsWith('Missing value for required variable') ||
      errorMessage.startsWith('Variable')
    ) {
      return res.status(400).json({
        error: errorMessage
      });
    }

    return res.status(500).json({
      error: 'Prompt execution failed.'
    });
  }
});

// L2.1 Execution History: Retrieve all stored in-memory executions
app.get('/api/executions', (_req: Request, res: Response) => {
  const executions = executionStore.getAll();
  return res.status(200).json({
    executions,
    total: executions.length
  });
});

// L2.1 Execution History: Clear all stored in-memory executions
// L2.3 Cascade: Also clears all evaluations to prevent orphaned references
app.delete('/api/executions', (_req: Request, res: Response) => {
  const clearedCount = executionStore.clear();
  evaluationStore.clear();
  return res.status(200).json({
    message: 'Execution history cleared successfully.',
    clearedCount
  });
});

// L2.3 Manual Prompt Evaluation: Create or update an evaluation for an execution
app.post('/api/evaluations', (req: Request, res: Response) => {
  const { executionId, criteria } = req.body;

  if (!executionId || typeof executionId !== 'string' || executionId.trim().length === 0) {
    return res.status(400).json({
      error: "Invalid request: 'executionId' must be a non-empty string."
    });
  }

  if (!Array.isArray(criteria) || criteria.length === 0) {
    return res.status(400).json({
      error: "Invalid request: 'criteria' must be a non-empty array with at least one criterion."
    });
  }

  const sanitizedCriteria: { name: string; score: number }[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < criteria.length; i++) {
    const item = criteria[i];
    if (!item || typeof item !== 'object') {
      return res.status(400).json({
        error: `Invalid request: Criterion at index ${i} must be an object.`
      });
    }

    const { name, score } = item;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: `Invalid request: Criterion name at index ${i} must be a non-empty string.`
      });
    }

    const trimmedName = name.trim();
    const normalizedName = trimmedName.toLowerCase();
    if (seenNames.has(normalizedName)) {
      return res.status(400).json({
        error: `Duplicate criterion name: '${trimmedName}'. Each criterion in an evaluation must have a unique name.`
      });
    }
    seenNames.add(normalizedName);

    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({
        error: `Invalid request: Criterion score for '${trimmedName}' must be an integer from 1 through 5.`
      });
    }

    sanitizedCriteria.push({
      name: trimmedName,
      score
    });
  }

  const existingExecution = executionStore.getById(executionId.trim());
  if (!existingExecution) {
    return res.status(404).json({
      error: `Execution not found with ID: '${executionId.trim()}'.`
    });
  }

  // Backend calculates overallScore as arithmetic mean; client-provided overallScore is ignored
  const sum = sanitizedCriteria.reduce((acc, c) => acc + c.score, 0);
  const overallScore = Math.round((sum / sanitizedCriteria.length) * 100) / 100;

  const { record, isCreated } = evaluationStore.addOrUpdate({
    executionId: executionId.trim(),
    criteria: sanitizedCriteria,
    overallScore
  });

  return res.status(isCreated ? 201 : 200).json(record);
});

// L2.3 Manual Prompt Evaluation: Retrieve evaluations (optionally filtered by executionId)
app.get('/api/evaluations', (req: Request, res: Response) => {
  const { executionId } = req.query;

  if (executionId !== undefined) {
    if (typeof executionId !== 'string' || executionId.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid query: 'executionId' must be a non-empty string."
      });
    }

    const evaluation = evaluationStore.getByExecutionId(executionId.trim());
    return res.status(200).json({
      evaluations: evaluation ? [evaluation] : [],
      total: evaluation ? 1 : 0
    });
  }

  const evaluations = evaluationStore.getAll();
  return res.status(200).json({
    evaluations,
    total: evaluations.length
  });
});

// L2.3 Manual Prompt Evaluation: Clear all stored evaluations
app.delete('/api/evaluations', (_req: Request, res: Response) => {
  const clearedCount = evaluationStore.clear();
  return res.status(200).json({
    message: 'Evaluation history cleared successfully.',
    clearedCount
  });
});

app.listen(PORT, () => {
  console.log(`[PromptLab Backend] Server running on http://localhost:${PORT}`);
});