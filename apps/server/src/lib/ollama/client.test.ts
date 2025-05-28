import { OllamaClient, OllamaCompatClient } from './client';

// Mock fetch
global.fetch = jest.fn();

describe('OllamaClient', () => {
  let ollamaClient: OllamaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    ollamaClient = new OllamaClient('http://test-ollama-url:11434');
  });

  test('should initialize with correct baseUrl', () => {
    expect(ollamaClient['baseUrl']).toBe('http://test-ollama-url:11434');
  });

  test('should use default baseUrl if not provided', () => {
    const defaultClient = new OllamaClient();
    expect(defaultClient['baseUrl']).toBe('http://localhost:11434');
  });

  test('should make correct API call for completions', async () => {
    const mockResponse = {
      model: 'llama2',
      created_at: new Date().toISOString(),
      response: 'This is a test response',
      done: true,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse),
    });

    const options = {
      model: 'llama2',
      prompt: 'Hello, world!',
      options: {
        temperature: 0.7,
      },
    };

    const result = await ollamaClient.createCompletion(options);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-ollama-url:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      }),
    );

    expect(result).toEqual(mockResponse);
  });

  test('should handle API errors correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      text: jest.fn().mockResolvedValueOnce('Model not found'),
    });

    await expect(
      ollamaClient.createCompletion({
        model: 'nonexistent-model',
        prompt: 'Test',
      }),
    ).rejects.toThrow('Ollama API error: Model not found');
  });

  test('should make correct API call for embeddings', async () => {
    const mockResponse = {
      embedding: [0.1, 0.2, 0.3],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse),
    });

    const options = {
      model: 'llama2',
      prompt: 'Embed this text',
    };

    const result = await ollamaClient.createEmbedding(options);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-ollama-url:11434/api/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      }),
    );

    expect(result).toEqual(mockResponse);
  });
});

describe('OllamaCompatClient', () => {
  let compatClient: OllamaCompatClient;

  beforeEach(() => {
    jest.clearAllMocks();
    compatClient = new OllamaCompatClient('http://test-ollama-url:11434');
  });

  test('should initialize with correct baseUrl', () => {
    expect(compatClient['client']['baseUrl']).toBe('http://test-ollama-url:11434');
  });

  test('should map OpenAI models to Ollama models', () => {
    // @ts-ignore - Accessing private property for testing
    expect(compatClient.getOllamaModel('gpt-4')).toBe('llama2');
    // @ts-ignore - Accessing private property for testing
    expect(compatClient.getOllamaModel('gpt-3.5-turbo')).toBe('llama2');
    // @ts-ignore - Accessing private property for testing
    expect(compatClient.getOllamaModel('text-embedding-ada-002')).toBe('llama2');

    // Test with a configured modelMappings
    // @ts-ignore - Accessing private property for testing
    compatClient.modelMappings = { 'gpt-4': 'mistral' };
    // @ts-ignore - Accessing private property for testing
    expect(compatClient.getOllamaModel('gpt-4')).toBe('mistral');
  });
});
