# 更新日志

## 2026-02-09

### 中文化
- ✅ 系统提示词改为中文
- ✅ 所有工具描述改为中文
  - `read_file`: 读取文件
  - `write_file`: 写入文件
  - `bash`: 执行命令
- ✅ 错误消息改为中文
- ✅ 工具参数描述改为中文

### 项目结构调整
- ✅ 所有文档移至 `docs/` 目录
  - `docs/QUICKSTART.md` - 快速启动
  - `docs/USAGE.md` - 使用文档
  - `docs/SUMMARY.md` - 项目总结

### 当前版本特性
- OpenAI Chat Completions API 流式调用
- Agent 循环和工具执行
- JSONL 会话持久化
- IM Webhook 集成
- Web Chat SSE API
- 基础编程工具（读、写、命令）

### 示例提示词

**文件操作：**
- "读取 package.json 文件"
- "创建一个 hello.txt 文件，内容写 Hello World"
- "读取 src/main.ts 的前 20 行"

**命令执行：**
- "运行 npm run typecheck"
- "列出当前目录的所有文件"

**复杂任务：**
- "帮我创建一个简单的 HTTP 服务器"
- "分析 package.json 并告诉我所有的依赖"
