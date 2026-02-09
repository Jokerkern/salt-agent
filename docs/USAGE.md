# salt-agent 使用指南

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置你的 OpenAI API Key：

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_MODEL=gpt-4o
PORT=3000
SESSIONS_DIR=./sessions
```

### 3. 启动服务器

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

## API 端点

### 健康检查

```bash
GET http://localhost:3000/
```

### IM Webhook

接收来自 IM 系统的消息：

```bash
POST /api/im/message
Content-Type: application/json

{
  "user_id": "user-123",
  "message": "Help me write a function to sort an array",
  "callback_url": "https://your-im-system.com/callback",
  "session_id": "optional-session-id"
}
```

响应（202 Accepted）：

```json
{
  "session_id": "abc123",
  "status": "accepted"
}
```

Agent 处理完成后，会向 `callback_url` POST 响应：

```json
{
  "session_id": "abc123",
  "response_text": "Here's a sorting function...",
  "status": "success"
}
```

### Web Chat (SSE 流式)

发送消息并获取流式响应：

```bash
# 1. 创建或获取 session
POST /api/chat/send
Content-Type: application/json

{
  "message": "Hello",
  "session_id": "optional-existing-session"
}

# 响应
{
  "session_id": "xyz789"
}

# 2. 订阅 SSE 流获取响应
GET /api/chat/stream/xyz789?message=Hello
```

SSE 事件示例：

```
event: agent_start
data: {"type":"agent_start"}

event: message_start
data: {"type":"message_start","message":{...}}

event: message_update
data: {"type":"message_update","message":{...},"assistantMessageEvent":{...}}

event: message_end
data: {"type":"message_end","message":{...}}

event: done
data: {"type":"done"}
```

### 会话管理

列出所有会话：

```bash
GET /api/sessions
```

响应：

```json
{
  "sessions": [
    {
      "id": "abc123",
      "source": "im",
      "createdAt": 1709123456789,
      "updatedAt": 1709123456789,
      "userId": "user-123"
    }
  ]
}
```

获取单个会话详情：

```bash
GET /api/sessions/abc123
```

响应：

```json
{
  "metadata": {
    "id": "abc123",
    "source": "im",
    "createdAt": 1709123456789,
    "updatedAt": 1709123456789,
    "userId": "user-123"
  },
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": 1709123456789
    },
    {
      "role": "assistant",
      "content": [{"type": "text", "text": "Hi there!"}],
      "model": "gpt-4o",
      "usage": {...},
      "stopReason": "stop",
      "timestamp": 1709123457000
    }
  ]
}
```

## 工具能力

Agent 拥有以下内置工具：

### read_file

读取文件内容：

```json
{
  "path": "src/main.ts",
  "offset": 10,
  "limit": 20
}
```

### write_file

写入文件：

```json
{
  "path": "output.txt",
  "content": "Hello, world!"
}
```

### bash

执行命令：

```json
{
  "command": "ls -la"
}
```

## 测试

### 测试 IM Webhook

使用提供的测试脚本：

```bash
chmod +x test-im.sh
./test-im.sh
```

或手动测试：

```bash
curl -X POST http://localhost:3000/api/im/message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "message": "Read the file package.json",
    "callback_url": "https://webhook.site/your-unique-id"
  }'
```

### 测试 SSE Chat

```bash
curl -N http://localhost:3000/api/chat/stream/test-session?message=Hello
```

## 架构

```
src/
├── ai/           # OpenAI 流式调用
├── agent/        # Agent 核心（循环、工具执行、事件）
├── tools/        # Coding 工具（read, write, bash）
├── session/      # JSONL 会话持久化
├── server/       # Hono HTTP 服务器
├── im/           # IM webhook 适配
└── main.ts       # 入口
```

## 下一步

- 添加更多工具（grep, find, ls, edit）
- 实现 Web UI（React + Vite）
- 添加认证和权限控制
- 性能优化和错误处理增强
