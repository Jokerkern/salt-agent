# 快速启动指南

## 1. 安装依赖

```bash
cd d:\project\salt-agent
npm install
```

## 2. 配置 API Key

创建 `.env` 文件：

```bash
OPENAI_API_KEY=你的OpenAI-API-Key
OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_MODEL=gpt-4o
PORT=3000
SESSIONS_DIR=./sessions
```

## 3. 启动服务器

```bash
npm run dev
```

看到输出：

```
Starting salt-agent...
Sessions directory: ./sessions
Server running on http://localhost:3000
OpenAI API Key: ✓ Set
Default Model: gpt-4o
```

## 4. 启动 Web UI（可选）

**终端 2**：
```bash
npm run web:dev
```

访问 `http://localhost:5173`，你会看到一个聊天界面。

## 5. 测试

### 方式一：Web UI 测试（推荐）

在浏览器中：
1. 点击"新建会话"
2. 输入：`读取 package.json 文件`
3. 观察流式响应和工具调用

### 方式二：IM Webhook 测试

打开 [webhook.site](https://webhook.site) 获取一个测试 webhook URL，然后：

```bash
curl -X POST http://localhost:3000/api/im/message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "message": "帮我创建一个 hello.txt 文件，内容是 Hello World",
    "callback_url": "https://webhook.site/你的unique-id"
  }'
```

你会收到：

```json
{"session_id":"xxxx","status":"accepted"}
```

几秒钟后，webhook.site 会收到 Agent 的回复。

### 方式三：SSE Chat 测试

```bash
# 发送消息并获取流式响应
curl -N "http://localhost:3000/api/chat/stream/test-session?message=Hello"
```

你会看到实时的 SSE 事件流。

### 方式四：查看会话

```bash
# 列出所有会话
curl http://localhost:3000/api/sessions

# 查看特定会话详情
curl http://localhost:3000/api/sessions/xxxx
```

## 5. 工具演示

试试这些提示词：

```bash
# 文件操作
"读取 package.json 文件"
"创建一个 hello.txt 文件，内容写 Hello World"
"读取 src/main.ts 的前 20 行"

# 命令执行
"运行 npm run typecheck"
"列出当前目录的所有文件"

# 复杂任务
"帮我创建一个简单的 HTTP 服务器"
"分析 package.json 并告诉我所有的依赖"
```

## 下一步

- 查看 [USAGE.md](USAGE.md) 了解详细 API 文档
- 查看 [SUMMARY.md](SUMMARY.md) 了解架构设计
- 阅读 [README.md](../README.md) 了解项目概述

## 常见问题

**Q: 启动失败，提示 OpenAI API Key 未设置**
A: 检查 `.env` 文件是否正确配置了 `OPENAI_API_KEY`

**Q: Agent 响应慢**
A: 检查网络连接和 OpenAI API 可用性，考虑使用代理或替换 `OPENAI_BASE_URL`

**Q: 会话存储在哪里？**
A: 默认在 `./sessions` 目录，每个会话一个 JSONL 文件

**Q: 如何扩展工具？**
A: 在 `src/tools/` 添加新工具，参考 `read.ts` 的实现

**Q: 支持哪些模型？**
A: 所有 OpenAI Chat Completions API 兼容的模型（gpt-4o, gpt-4-turbo, gpt-3.5-turbo 等）
