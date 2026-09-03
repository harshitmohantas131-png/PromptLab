import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { LLMProvider } from './providers/llm.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { PromptService } from './services/prompt.service.js';
import { executionStore } from './services/execution.store.js';

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
app.delete('/api/executions', (_req: Request, res: Response) => {
  const clearedCount = executionStore.clear();
  return res.status(200).json({
    message: 'Execution history cleared successfully.',
    clearedCount
  });
});

app.listen(PORT, () => {
  console.log(`[PromptLab Backend] Server running on http://localhost:${PORT}`);
});