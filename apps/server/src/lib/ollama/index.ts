import { OllamaCompatClient } from './client';
import { CoreMessage } from '../../types';
import { env } from 'cloudflare:workers';

// Main interface for interacting with Ollama AI
export class OllamaAI {
  private client: OllamaCompatClient;
  private defaultModel: string = 'llama3';

  constructor() {
    // Get Ollama host from environment or use default localhost
    const ollamaHost = env.OLLAMA_HOST || 'http://localhost:11434';
    this.client = new OllamaCompatClient(ollamaHost);

    // Set default model from environment if available
    if (env.OLLAMA_DEFAULT_MODEL) {
      this.defaultModel = env.OLLAMA_DEFAULT_MODEL;
    }
  }

  /**
   * Generate a chat completion
   */
  async generateChatCompletion(
    messages: CoreMessage[],
    options?: {
      model?: string;
      temperature?: number;
      stream?: boolean;
    },
  ) {
    // Ensure Ollama is running
    const isRunning = await this.client.ensureRunning();
    if (!isRunning) {
      throw new Error('Ollama is not running and could not be started');
    }

    // Map to format expected by Ollama
    const formattedMessages = messages.map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    return this.client.createChatCompletion({
      model: options?.model || this.defaultModel,
      messages: formattedMessages,
      temperature: options?.temperature || 0.7,
      stream: options?.stream || false,
    });
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbeddings(texts: string | string[]) {
    // Ensure Ollama is running
    const isRunning = await this.client.ensureRunning();
    if (!isRunning) {
      throw new Error('Ollama is not running and could not be started');
    }

    return this.client.createEmbedding({
      model: 'nomic-embed', // Use a model appropriate for embeddings
      input: texts,
    });
  }

  /**
   * List available models
   */
  async listModels() {
    // Ensure Ollama is running
    const isRunning = await this.client.ensureRunning();
    if (!isRunning) {
      throw new Error('Ollama is not running and could not be started');
    }

    return this.client.listModels();
  }

  /**
   * Get suggested prompts for email composition
   */
  async getSuggestedPrompts(emailContext: string): Promise<string[]> {
    try {
      const messages: CoreMessage[] = [
        {
          role: 'system',
          content: `You are an email assistant. Based on the context provided, suggest 3-5 concise, helpful prompts that the user might want to use to compose their email. Make the suggestions varied and useful. Return only the list of prompts, each on a new line.`,
        },
        {
          role: 'user',
          content: `Here is the context of the email I'm working on: ${emailContext}`,
        },
      ];

      const completion = await this.generateChatCompletion(messages);

      // Extract the response text
      const responseText = completion.choices[0].message.content;

      // Split into individual prompts
      return responseText
        .split('\n')
        .map((line) => line.replace(/^\d+\.\s*/, '').trim()) // Remove numbered lists if present
        .filter((line) => line.length > 0)
        .slice(0, 5); // Take at most 5 suggestions
    } catch (error) {
      console.error('Error getting suggested prompts:', error);
      return [
        'Draft a professional response',
        'Summarize the key points',
        'Compose a friendly reply',
      ];
    }
  }

  /**
   * Summarize an email thread for quick understanding
   */
  async summarizeThread(threadContent: string): Promise<string> {
    try {
      const messages: CoreMessage[] = [
        {
          role: 'system',
          content: `You are an email assistant. Summarize the provided email thread in 2-3 concise sentences, capturing the main discussion points and any required actions.`,
        },
        {
          role: 'user',
          content: threadContent,
        },
      ];

      const completion = await this.generateChatCompletion(messages);
      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Error summarizing thread:', error);
      return 'Could not generate summary.';
    }
  }

  /**
   * Analyze sentiment of an email
   */
  async analyzeEmailSentiment(emailContent: string): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number;
    analysis: string;
  }> {
    try {
      const messages: CoreMessage[] = [
        {
          role: 'system',
          content: `You are an email sentiment analysis tool. Analyze the sentiment of the provided email and return a JSON object with 'sentiment' (positive, neutral, or negative), 'score' (number between -1 and 1), and 'analysis' (brief explanation of your assessment).`,
        },
        {
          role: 'user',
          content: emailContent,
        },
      ];

      const completion = await this.generateChatCompletion(messages);
      const responseText = completion.choices[0].message.content;

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback if JSON parsing fails
      return {
        sentiment: 'neutral',
        score: 0,
        analysis: 'Could not analyze sentiment.',
      };
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      return {
        sentiment: 'neutral',
        score: 0,
        analysis: 'Error analyzing sentiment.',
      };
    }
  }
}

// Singleton instance for application-wide use
let ollamaAI: OllamaAI | null = null;

export function getOllamaAI(): OllamaAI {
  if (!ollamaAI) {
    ollamaAI = new OllamaAI();
  }
  return ollamaAI;
}
