# Ollama Integration Setup

Zero can use Ollama for local AI processing instead of OpenAI. This guide explains how to set up and configure Ollama with Zero.

## What is Ollama?

[Ollama](https://ollama.ai/) is an open-source project that lets you run large language models (LLMs) locally on your machine. This provides:

- Privacy: Your data never leaves your computer
- No API costs: Run models without usage fees
- Control: Choose specific models that match your needs
- Offline capability: Use AI features without internet access

## Prerequisites

1. Install Ollama on your system:

   - macOS: Download from [https://ollama.ai/](https://ollama.ai/)
   - Linux: Follow instructions at [Ollama GitHub](https://github.com/ollama/ollama)
   - Windows: Use WSL (Windows Subsystem for Linux)

2. Install a model (if not already done):

   ```bash
   ollama pull llama2
   ```

   You can also use models like:

   - `mistral`: Good balance of performance and speed
   - `llama2`: Meta's language model
   - `gemma`: Google's efficient language model

   Check the [Ollama library](https://ollama.ai/library) for more models.

## Configuration

Zero uses environment variables to configure Ollama:

1. Set the following in your `.env` file or directly in `wrangler.jsonc`:

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
OLLAMA_ENABLED=true
```

2. Adjust these settings as needed:
   - `OLLAMA_BASE_URL`: Where your Ollama server is running (default: http://localhost:11434)
   - `OLLAMA_MODEL`: The model you want to use (default: llama2)
   - `OLLAMA_ENABLED`: Whether to use Ollama instead of OpenAI (set to "true")

## Using with Zero

When `OLLAMA_ENABLED` is set to `true`, Zero will automatically use Ollama for:

- Email summarization
- Content analysis
- Text generation
- Embedding generation

You can switch between Ollama and OpenAI by changing the `OLLAMA_ENABLED` environment variable.

## Performance Considerations

- Local models require significant resources, especially for larger models
- Recommended minimum specs:
  - 8GB RAM for smaller models (7B parameter models)
  - 16GB+ RAM for larger models
  - GPU acceleration is highly recommended for better performance

## Troubleshooting

If you encounter issues:

1. Ensure Ollama is running: `ollama serve`
2. Check if your model is installed: `ollama list`
3. Verify the environment variables are set correctly
4. Check model compatibility with your hardware
5. Monitor resource usage during operations

## Advanced Configuration

For advanced users:

- You can adjust model parameters in `src/lib/ollama/client.ts`
- Custom prompting templates can be modified in the Ollama integration code
- GPU settings can be configured with Ollama's command-line options

## Privacy Note

When using Ollama:

- All AI processing happens locally on your machine
- No data is sent to external APIs
- Model weights are downloaded once during setup
