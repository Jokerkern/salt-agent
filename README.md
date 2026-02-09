# salt-agent

基于 OpenAI 的编程助手，支持 HTTP 服务器、IM 集成和 Web UI。

## 📚 文档

- [快速启动](docs/QUICKSTART.md) - 5分钟上手指南
- [使用文档](docs/USAGE.md) - 完整 API 文档和示例
- [Web UI 指南](docs/WEB_UI.md) - Web 界面使用说明
- [测试指南](docs/TEST.md) - 完整测试流程
- [部署指南](DEPLOYMENT.md) - 生产环境部署
- [项目总结](docs/SUMMARY.md) - 架构设计和技术细节
- [完成清单](docs/COMPLETE.md) - 项目完成总结
- [更新日志](docs/CHANGES.md) - 版本更新记录

---

## 功能特性

- **OpenAI 集成**: Chat Completions API 流式调用
- **编程工具**: 文件操作、命令执行、代码搜索
- **IM Webhook**: 通过 HTTP POST 接收 IM 消息
- **Web UI**: 交互式聊天界面和会话监控
- **会话管理**: 基于 JSONL 的持久化存储

## 架构

```
src/
├── ai/          # OpenAI 流式调用
├── agent/       # Agent 核心（循环、工具执行、事件）
├── tools/       # 编程工具（read, write, bash）
├── session/     # JSONL 会话持久化
├── server/      # Hono HTTP 服务器
├── im/          # IM webhook 适配
└── main.ts      # 入口

web/
├── src/
│   ├── components/  # React 组件
│   ├── hooks/       # React hooks
│   └── lib/         # API 客户端
└── dist/            # 构建产物
```

## 安装

```bash
# 安装后端依赖
npm install

# 安装前端依赖
npm run web:install
```

配置环境变量：

```bash
cp .env.example .env
# 编辑 .env 设置你的 OPENAI_API_KEY
```

## 开发

### 后端服务器

```bash
npm run dev
```

### Web UI 开发

**开发模式**（推荐）：
```bash
# 终端 1
npm run dev

# 终端 2
npm run web:dev
```

访问 `http://localhost:5173`（前端开发服务器）

**生产模式**：
```bash
npm run build
npm start
```

访问 `http://localhost:3001`（后端服务器提供静态文件）

### 类型检查

```bash
npm run typecheck
```

## 使用

### Web UI

访问 `http://localhost:5173` 使用 Web 界面。

### IM Webhook

通过 HTTP 发送消息：

```bash
POST /api/im/message
Content-Type: application/json

{
  "session_id": "可选的已存在会话ID",
  "user_id": "user123",
  "message": "帮我写一个函数",
  "callback_url": "https://your-im.com/webhook/callback",
  "metadata": {}
}
```

Agent 会处理消息并将响应 POST 到 `callback_url`。

### API 端点

- `GET /api` - API 信息
- `POST /api/im/message` - IM webhook 接收
- `POST /api/chat/send` - 发送消息（Web）
- `GET /api/chat/stream/:sessionId` - SSE 流式响应
- `GET /api/sessions` - 会话列表
- `GET /api/sessions/:id` - 会话详情

## 工具能力

内置工具：
- `read_file` - 读取文件
- `write_file` - 写入文件
- `bash` - 执行命令

可扩展添加更多工具（grep, find, ls, edit 等）。

## 许可证

MIT
