# Web UI 使用指南

## 启动方式

### 开发模式

需要同时启动后端服务器和前端开发服务器：

**终端 1 - 后端服务器**:
```bash
npm run dev
```

**终端 2 - 前端开发服务器**:
```bash
npm run web:dev
```

然后访问: `http://localhost:5173`

前端会自动代理 API 请求到 `http://localhost:3001`

### 生产模式

先构建前端，然后启动服务器：

```bash
npm run build
npm start
```

访问: `http://localhost:3001`

服务器会同时提供 API 和静态文件服务。

## 功能说明

### 会话列表（左侧栏）

- 显示所有会话（Web + IM）
- 来源标签：
  - 🌐 Web - 从 Web UI 创建的会话
  - 💬 IM - 从 IM webhook 创建的会话
- 自动刷新（每 10 秒）
- 点击会话切换当前对话
- 点击"新建会话"开始新对话

### 聊天面板（右侧）

- 显示完整对话历史
- 支持 Markdown 渲染
- 工具调用可视化展示
- SSE 流式响应（实时显示）
- 所有会话都可以继续对话（包括 IM 会话）

### 消息类型

#### 用户消息
- 右对齐，蓝色气泡
- 显示原始文本

#### 助手消息
- 左对齐，灰色气泡
- Markdown 渲染
- 代码块高亮

#### 工具调用
- 显示工具名称和参数
- 白色背景，边框样式

#### 工具结果
- 成功：绿色边框
- 失败：红色边框
- 显示返回内容

## 快捷键

- `Enter` - 发送消息
- `Shift + Enter` - 换行

## 注意事项

1. **IM 会话继续对话**：在 Web 上继续 IM 会话时，新消息只存储在会话中，不会回调到 IM 系统

2. **会话持久化**：所有消息自动保存到 JSONL 文件

3. **实时更新**：会话列表每 10 秒自动刷新

4. **错误处理**：网络错误或 API 失败会在控制台显示

## 技术栈

- React 18
- Vite
- TypeScript
- Tailwind CSS
- React Markdown
- date-fns

## 自定义配置

### 修改 API 地址

编辑 `web/vite.config.ts`:

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://your-server:port',
      changeOrigin: true,
    },
  },
}
```

### 修改刷新间隔

编辑 `web/src/hooks/useSessions.ts`:

```typescript
const interval = setInterval(fetchSessions, 10000); // 改成你想要的毫秒数
```
