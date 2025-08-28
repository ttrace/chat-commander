import gemini from './gemini';
import openai from './openai';
import ollama from './ollama';

export interface Provider {
  id: string;
  buildMessages: (opts: any) => any[];
  callSync?: (opts: { model?: string; messages: any[]; schema?: object}) => Promise<string>;
  callStream?: (opts: { model?: string; messages: any[] }) => AsyncIterable<string | { text: string }>;
}

export const PROVIDERS: Record<string, Provider> = {
  gemini,
  openai,
  ollama,
};