# salt-agent

A coding agent powered by OpenAI with HTTP server for IM integration and Web UI.

## 📚 文档

- [快速启动](docs/QUICKSTART.md) - 5分钟上手指南
- [使用文档](docs/USAGE.md) - 完整 API 文档和示例
- [项目总结](docs/SUMMARY.md) - 架构设计和技术细节
- [更新日志](docs/CHANGES.md) - 版本更新记录

---

## Features

- **OpenAI Integration**: Chat completions with streaming support
- **Coding Tools**: File operations, command execution, code search
- **IM Webhook**: Receive messages from IM systems via HTTP POST
- **Web UI**: Interactive chat interface with session monitoring
- **Session Management**: JSONL-based persistence with full conversation history

## Architecture

```
src/
├── ai/          # OpenAI streaming & types
├── agent/       # Agent loop & state management
├── tools/       # Coding tools (read, write, bash, grep, etc.)
├── session/     # Session persistence
├── server/      # HTTP server (Hono)
└── im/          # IM webhook adapter
```

## Setup

```bash
npm install
```

Create a `.env` file:

```bash
cp .env.example .env
# Edit .env and set your OPENAI_API_KEY
```

## Development

```bash
# Start server
npm run dev
```

Or run type checking:

```bash
npm run typecheck
```

## Usage

### Web UI

Visit `http://localhost:3000` for the web interface.

### IM Webhook

Send messages via HTTP:

```bash
POST /api/im/message
Content-Type: application/json

{
  "session_id": "optional-existing-session",
  "user_id": "user123",
  "message": "Help me write a function",
  "callback_url": "https://your-im.com/webhook/callback",
  "metadata": {}
}
```

The agent will process the message and POST the response to `callback_url`.

## License

MIT
