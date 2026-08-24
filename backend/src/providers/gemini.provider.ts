import { GoogleGenAI } from '@google/genai';
import { LLMProvider } from './llm.provider';

export class GeminiProvider implements LLMProvider {
  private ai: GoogleGenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('GEMINI_API_KEY environment variable is missing or empty.');
    }

    this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
    });

    const text = response.text;
    if (!text || text.trim() === '') {
      throw new Error('Gemini API returned an empty response.');
    }

    return text;
  }
}
