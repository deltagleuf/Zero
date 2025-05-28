import { createReadableStreamFromReadable } from '@cloudflare/workers-types';
import { spawn } from 'child_process';

// Interface for Ollama completions request
export interface OllamaCompletionsOptions {
  model: string; // e.g., "llama2", "mistral", etc.
  prompt?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
    seed?: number;
    num_ctx?: number;
    repeat_penalty?: number;
    repeat_last_n?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    tfs_z?: number;
    mirostat?: number;
    mirostat_tau?: number;
    mirostat_eta?: number;
    grammar?: string;
  };
  system?: string;
  template?: string;
  context?: number[];
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  keep_alive?: number | string;
  format?: 'json';
}

// Interface for Ollama completions response
export interface OllamaCompletionsResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// Ollama embeddings options
export interface OllamaEmbeddingsOptions {
  model: string;
  prompt: string;
  keep_alive?: number | string;
}

// Ollama embeddings response
export interface OllamaEmbeddingsResponse {
  embedding: number[];
}

// Main class for interacting with Ollama
export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate completions using Ollama model
   */
  async createCompletion(options: OllamaCompletionsOptions): Promise<OllamaCompletionsResponse> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Generate completions as a stream
   */
  async createCompletionStream(
    options: OllamaCompletionsOptions,
  ): Promise<ReadableStream<OllamaCompletionsResponse>> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...options,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${error}`);
    }

    return response.body!;
  }

  /**
   * Generate embeddings for a prompt
   */
  async createEmbedding(options: OllamaEmbeddingsOptions): Promise<OllamaEmbeddingsResponse> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${error}`);
    }

    return response.json();
  }

  /**
   * List available models
   */
  async listModels(): Promise<{
    models: Array<{ name: string; modified_at: string; size: number; digest: string }>;
  }> {
    const response = await fetch(`${this.baseUrl}/api/tags`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Check if Ollama is running, and start it if not
   */
  async ensureOllamaRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      // If Ollama is not running, try to start it
      console.log('Ollama is not running, attempting to start it...');

      return new Promise((resolve) => {
        // Start Ollama as a child process
        const ollamaProcess = spawn('ollama', ['serve']);

        ollamaProcess.stdout.on('data', (data) => {
          console.log(`Ollama: ${data}`);
          if (data.toString().includes('listening')) {
            resolve(true);
          }
        });

        ollamaProcess.stderr.on('data', (data) => {
          console.error(`Ollama error: ${data}`);
        });

        ollamaProcess.on('error', (error) => {
          console.error('Failed to start Ollama:', error);
          resolve(false);
        });

        // Give Ollama some time to start
        setTimeout(() => {
          resolve(false);
        }, 5000);
      });
    }
  }
}

// OpenAI-compatible interface for Ollama
export class OllamaCompatClient {
  private client: OllamaClient;
  private modelMappings: Record<string, string>;

  constructor(baseUrl?: string) {
    this.client = new OllamaClient(baseUrl);

    // Map OpenAI model names to Ollama model names
    this.modelMappings = {
      'gpt-3.5-turbo': 'llama3',
      'gpt-4': 'llama3',
      'gpt-4o': 'llama3',
      'text-embedding-ada-002': 'nomic-embed',
      'text-embedding-3-small': 'nomic-embed',
      'text-embedding-3-large': 'nomic-embed',
    };
  }

  /**
   * Get the equivalent Ollama model name from OpenAI model name
   */
  private getOllamaModel(openaiModel: string): string {
    return this.modelMappings[openaiModel] || 'llama3'; // Default to llama3
  }

  /**
   * OpenAI-compatible chat completions API
   */
  async createChatCompletion(options: {
    model: string;
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  }): Promise<any> {
    const ollamaModel = this.getOllamaModel(options.model);

    // Extract system message if present
    const systemMessage = options.messages.find((m) => m.role === 'system')?.content;

    // Create Ollama-compatible request
    const ollamaRequest: OllamaCompletionsOptions = {
      model: ollamaModel,
      messages: options.messages,
      options: {
        temperature: options.temperature,
        num_predict: options.max_tokens || 4096,
      },
    };

    if (systemMessage) {
      ollamaRequest.system = systemMessage;
    }

    // Handle streaming request
    if (options.stream) {
      const stream = await this.client.createCompletionStream(ollamaRequest);

      // Transform to OpenAI-compatible stream
      return this.transformStream(stream);
    }

    // Handle regular request
    const response = await this.client.createCompletion(ollamaRequest);

    // Transform to OpenAI-compatible response
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: options.model,
      choices: [
        {
          message: {
            role: 'assistant',
            content: response.response,
          },
          finish_reason: 'stop',
          index: 0,
        },
      ],
      usage: {
        prompt_tokens: response.prompt_eval_count || 0,
        completion_tokens: response.eval_count || 0,
        total_tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
      },
    };
  }

  /**
   * OpenAI-compatible embeddings API
   */
  async createEmbedding(options: { model: string; input: string | string[] }): Promise<any> {
    const ollamaModel = this.getOllamaModel(options.model);

    const inputs = Array.isArray(options.input) ? options.input : [options.input];

    // Process each input text
    const embeddings = await Promise.all(
      inputs.map(async (text, index) => {
        const response = await this.client.createEmbedding({
          model: ollamaModel,
          prompt: text,
        });

        return {
          object: 'embedding',
          embedding: response.embedding,
          index,
        };
      }),
    );

    // Return OpenAI-compatible response
    return {
      object: 'list',
      data: embeddings,
      model: options.model,
      usage: {
        prompt_tokens: inputs.reduce((acc, text) => acc + text.length / 4, 0), // Rough estimate
        total_tokens: inputs.reduce((acc, text) => acc + text.length / 4, 0),
      },
    };
  }

  /**
   * Transform Ollama stream to OpenAI-compatible stream
   */
  private transformStream(
    ollamaStream: ReadableStream<OllamaCompletionsResponse>,
  ): ReadableStream<Uint8Array> {
    let responseText = '';

    const reader = ollamaStream.getReader();

    const encoder = new TextEncoder();

    return new ReadableStream({
      async pull(controller) {
        const { value, done } = await reader.read();

        if (done) {
          // Final message with [DONE]
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }

        // Accumulate the response text
        responseText += value.response;

        // Create OpenAI-compatible chunk
        const chunk = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: value.model,
          choices: [
            {
              delta: {
                role: 'assistant',
                content: value.response,
              },
              index: 0,
              finish_reason: value.done ? 'stop' : null,
            },
          ],
        };

        // Encode and send the chunk
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));

        if (value.done) {
          // Final message with [DONE]
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });
  }

  /**
   * List available models
   */
  async listModels(): Promise<any> {
    const { models } = await this.client.listModels();

    // Transform to OpenAI-compatible format
    return {
      object: 'list',
      data: models.map((model) => ({
        id: model.name,
        object: 'model',
        created: Date.parse(model.modified_at) / 1000,
        owned_by: 'ollama',
      })),
    };
  }

  /**
   * Ensure Ollama is running
   */
  async ensureRunning(): Promise<boolean> {
    return this.client.ensureOllamaRunning();
  }
}
