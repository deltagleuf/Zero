import type { CoreMessage } from '../types';
import { env } from 'cloudflare:workers';
import { getOllamaAI } from './ollama';

// Main file for managing AI provider selection and routing

/**
 * Determines which AI provider to use based on environment settings
 */
export function getAIProvider(): 'ollama' | 'openai' {
  // Check if OLLAMA_ENABLED environment variable is set
  if (env.OLLAMA_ENABLED === 'true') {
    return 'ollama';
  }

  // Fallback to OpenAI
  return 'openai';
}

/**
 * Generate chat completion based on current provider setting
 */
export async function generateChatCompletion(
  messages: CoreMessage[],
  options?: {
    model?: string;
    temperature?: number;
    stream?: boolean;
  },
) {
  const provider = getAIProvider();

  if (provider === 'ollama') {
    const ollama = getOllamaAI();
    return ollama.generateChatCompletion(messages, options);
  } else {
    // Use OpenAI (your existing implementation)
    // Replace this with actual OpenAI implementation call
    throw new Error('OpenAI implementation not provided');
  }
}

/**
 * Generate embeddings based on current provider setting
 */
export async function generateEmbeddings(texts: string | string[]) {
  const provider = getAIProvider();

  if (provider === 'ollama') {
    const ollama = getOllamaAI();
    return ollama.generateEmbeddings(texts);
  } else {
    // Use OpenAI (your existing implementation)
    // Replace this with actual OpenAI implementation call
    throw new Error('OpenAI implementation not provided');
  }
}

/**
 * Get email suggestions based on current provider
 */
export async function getEmailSuggestions(emailContext: string): Promise<string[]> {
  const provider = getAIProvider();

  if (provider === 'ollama') {
    const ollama = getOllamaAI();
    return ollama.getSuggestedPrompts(emailContext);
  } else {
    // Use OpenAI (your existing implementation)
    // Use fallback suggestions if needed
    return [
      'Draft a professional response',
      'Summarize the key points',
      'Compose a friendly reply',
    ];
  }
}

/**
 * Summarize an email thread based on current provider
 */
export async function summarizeEmailThread(threadContent: string): Promise<string> {
  const provider = getAIProvider();

  if (provider === 'ollama') {
    const ollama = getOllamaAI();
    return ollama.summarizeThread(threadContent);
  } else {
    // Use OpenAI (your existing implementation)
    // Return a placeholder if needed
    return 'Email thread summary unavailable';
  }
}
