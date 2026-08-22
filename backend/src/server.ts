import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { LLMProvider } from './providers/llm.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';

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

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'PromptLab API is healthy'
  });
});

app.post('/api/llm/generate', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({
      error: "Invalid request: 'prompt' must be a non-empty string."
    });
  }

  try {
    if (!llmProvider) {
      llmProvider = new GeminiProvider();
    }

    const text = await llmProvider.generate(prompt.trim());
    return res.status(200).json({ text });
  } catch (error) {
    console.error('[LLM Generation Error]:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({
      error: 'Failed to generate response from LLM provider.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`[PromptLab Backend] Server running on http://localhost:${PORT}`);
});

