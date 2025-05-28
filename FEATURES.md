# New Features

## IMAP Support

Zero now supports connecting to any email account via IMAP protocol:

- Connect to any email provider that offers IMAP access
- Auto-detection of server settings for common email providers
- Advanced configuration for custom email servers
- Seamless integration with the existing Zero interface

### Setting up an IMAP account

1. Go to Settings > Connections
2. Click "Add Account"
3. Select "IMAP" from the providers list
4. Enter your email credentials and optional server settings
5. For detailed instructions, see [IMAP Setup Guide](./docs/imap-setup.md)

## Ollama Integration

Zero now supports local AI processing using [Ollama](https://ollama.ai):

- Process emails locally without sending data to external AI providers
- Privacy-focused - all AI operations happen on your machine
- Compatible with various LLM models (llama2, mistral, gemma, etc.)
- Automatic fallback to OpenAI when Ollama is not available

### Setting up Ollama

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull your preferred model: `ollama pull llama2`
3. Configure Zero to use Ollama in your environment variables:
   ```
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=llama2
   OLLAMA_ENABLED=true
   ```
4. For detailed instructions, see [Ollama Setup Guide](./docs/ollama-setup.md)
