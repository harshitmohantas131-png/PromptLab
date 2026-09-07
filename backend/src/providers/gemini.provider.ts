import { GoogleGenAI } from '@google/genai';
import { LLMProvider } from './llm.provider.js';

export class GeminiProvider implements LLMProvider {
  private ai: GoogleGenAI;
  public readonly model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('GEMINI_API_KEY environment variable is missing or empty.');
    }

    this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
      });

      const text = response.text;
      if (!text || text.trim() === '') {
        throw new Error('Gemini API returned an empty response.');
      }

      return text;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')) &&
        this.model !== 'gemini-3.5-flash'
      ) {
        console.warn(`[GeminiProvider] Quota exceeded on ${this.model}, falling back to gemini-3.5-flash...`);
        const fallbackResponse = await this.ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
        });
        const text = fallbackResponse.text;
        if (text && text.trim().length > 0) {
          return text;
        }
      }
      throw error;
    }
  }
}
