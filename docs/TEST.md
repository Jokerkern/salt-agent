# 测试指南

## 前置条件

1. 确保 `.env` 文件配置了 OpenAI API Key
2. 后端服务器已启动（`npm run dev`）

## 测试流程

### 1. 测试 Web UI

**启动前端**：
```bash
npm run web:dev
```

**访问**: `http://localhost:5173`

**测试步骤**：
1. 点击"新建会话"
2. 输入消息：`读取 package.json 文件`
3. 观察 SSE 流式响应
4. 查看工具调用展示（read_file）
5. 查看工具结果
6. 继续对话：`这个项目用了哪些依赖？`

**预期结果**：
- ✓ 消息实时流式显示
- ✓ 工具调用有视觉反馈
- ✓ Markdown 正确渲染
- ✓ 会话列表自动更新
- ✓ 可以无限轮次对话

### 2. 测试 IM Webhook

**准备**: 访问 [webhook.site](https://webhook.site) 获取测试 URL

**发送请求**：
```bash
curl -X POST http://localhost:3001/api/im/message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "message": "创建一个 hello.txt 文件，内容写 Hello World",
    "callback_url": "https://webhook.site/你的unique-id"
  }'
```

**预期结果**：
- ✓ 立即返回 `202 Accepted` 和 session_id
- ✓ 几秒后 webhook.site 收到回调
- ✓ 回调包含 response_text 和 status: "success"
- ✓ hello.txt 文件已创建
- ✓ Web UI 会话列表出现新的 IM 会话

### 3. 测试 IM 会话在 Web 继续

**前置**: 完成测试 2，获得一个 IM 会话

**操作**：
1. 在 Web UI 会话列表中找到该 IM 会话（💬 IM 标签）
2. 点击进入
3. 查看之前的对话历史
4. 输入新消息：`读取刚才创建的 hello.txt`
5. 观察流式响应

**预期结果**：
- ✓ 显示完整历史（IM 的原始消息 + Agent 回复）
- ✓ 可以继续对话
- ✓ 新消息保存在同一会话中
- ✓ IM 系统**不会**收到新消息（符合设计）

### 4. 测试会话管理

**查看所有会话**：
```bash
curl http://localhost:3001/api/sessions
```

**查看特定会话**：
```bash
curl http://localhost:3001/api/sessions/会话ID
```

**预期结果**：
- ✓ 返回 JSON 格式的会话列表
- ✓ 包含 metadata 和 messages
- ✓ source 字段正确标记 "web" 或 "im"

### 5. 测试工具能力

在 Web UI 或 IM 中尝试这些指令：

```
"读取 package.json 文件"
"创建一个 test.js 文件，内容是 console.log('hello')"
"运行 npm run typecheck"
"列出当前目录的文件"
```

**预期结果**：
- ✓ read_file 正确返回文件内容
- ✓ write_file 成功创建文件
- ✓ bash 返回命令输出
- ✓ 所有工具结果在 UI 中清晰展示

## 常见问题排查

### Web UI 无法加载

检查：
1. 后端服务器是否运行在 3001 端口
2. Vite 代理配置是否正确
3. 浏览器控制台是否有 CORS 错误

### SSE 连接失败

检查：
1. `/api/chat/stream` 路由是否正常
2. 浏览器网络标签是否显示 EventSource 连接
3. 后端是否有错误日志

### IM Callback 未收到

检查：
1. callback_url 是否正确
2. 后端日志是否显示发送成功
3. Agent 是否正确完成处理

### 工具执行失败

检查：
1. 工作目录是否正确（应该是 salt-agent 根目录）
2. 文件路径是相对还是绝对
3. 命令是否有权限执行

## 性能测试

### 并发测试

同时发送多个 IM webhook 请求：

```bash
for i in {1..5}; do
  curl -X POST http://localhost:3001/api/im/message \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":\"user-$i\",\"message\":\"测试消息 $i\",\"callback_url\":\"https://webhook.site/xxx\"}" &
done
```

**预期**：所有请求正常处理，不互相阻塞

### 长会话测试

在 Web UI 中进行 10+ 轮对话，观察：
- ✓ 消息正确持久化
- ✓ 上下文正确传递
- ✓ 性能无明显下降
- ✓ 内存无泄漏

## 成功标准

- [x] Web UI 正常启动和显示
- [x] IM webhook 正常接收和回调
- [x] SSE 流式响应实时显示
- [x] 工具调用正确执行和展示
- [x] 会话正确持久化
- [x] IM 会话可在 Web 继续
- [x] 所有类型检查通过
