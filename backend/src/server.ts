import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { LLMProvider } from './providers/llm.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { PromptService } from './services/prompt.service.js';

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

// L1.3 Application Feature: Prompt Execution
app.post('/api/prompts/execute', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({
      error: "Invalid request: 'prompt' must be a non-empty string."
    });
  }

  try {
    const promptService = getPromptService();
    const result = await promptService.execute(prompt.trim());
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Prompt Execution Error]:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({
      error: 'Prompt execution failed.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`[PromptLab Backend] Server running on http://localhost:${PORT}`);
});
