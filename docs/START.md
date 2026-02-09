# 🚀 启动指南

## 快速启动（3 步）

### 1. 配置 API Key

确保 `.env` 文件存在并配置了 API Key：

```bash
OPENAI_API_KEY=你的key
OPENAI_BASE_URL=https://aihub.gz4399.com/v1
DEFAULT_MODEL=gpt-5.2
PORT=3001
SESSIONS_DIR=./sessions
```

### 2. 启动后端服务器

**终端 1**：
```bash
npm run dev
```

看到输出：
```
Starting salt-agent...
Sessions directory: ./sessions
Server running on http://localhost:3001
OpenAI API Key: ✓ Set
Default Model: gpt-5.2
```

### 3. 启动 Web UI

**终端 2**：
```bash
npm run web:dev
```

看到输出：
```
VITE v7.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

## 访问

打开浏览器访问: **http://localhost:5173**

你会看到：
```
┌────────────────────────────────────┐
│  Salt Agent - Coding Assistant     │
├─────────┬──────────────────────────┤
│ 📋会话  │  选择一个会话开始聊天     │
│         │  或创建新会话             │
│ 🆕新建  │                          │
│         │                          │
└─────────┴──────────────────────────┘
```

点击"新建会话"，输入消息开始聊天！

## 测试示例

试试这些指令：

```
读取 package.json 文件
创建一个 hello.txt 文件，内容写 Hello World
运行 npm run typecheck
列出当前目录的文件
帮我分析一下这个项目的结构
```

## 观察要点

1. **流式响应**：消息逐字显示，不是一次性出现
2. **工具调用**：会看到白色框显示工具名称和参数
3. **工具结果**：绿色框显示成功，红色框显示错误
4. **会话列表**：左侧自动更新，显示所有会话

## 下一步

- 查看 [测试指南](docs/TEST.md) 进行完整测试
- 查看 [Web UI 指南](docs/WEB_UI.md) 了解更多功能
- 查看 [使用文档](docs/USAGE.md) 了解 API 端点

---

**遇到问题？**

1. 端口被占用 → 修改 `.env` 中的 `PORT`
2. API Key 未设置 → 检查 `.env` 文件
3. Web UI 无法加载 → 确保后端在 3001 运行
4. 类型错误 → 运行 `npm run typecheck`

**一切就绪，开始使用吧！** 🎉
