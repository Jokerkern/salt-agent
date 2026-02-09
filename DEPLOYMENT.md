# 部署指南

## 开发环境

### 方式一：分离模式（推荐开发时使用）

**终端 1 - 后端服务器**：
```bash
npm run dev
```
服务器运行在 `http://localhost:3001`

**终端 2 - 前端开发服务器**：
```bash
npm run web:dev
```
前端运行在 `http://localhost:5173`（自动代理 API 到 3001）

优点：
- 前端热更新快
- 可以单独调试前后端
- 开发体验好

### 方式二：集成模式

```bash
npm run build
npm start
```

访问 `http://localhost:3001`（一个服务器同时提供 API 和 Web UI）

优点：
- 接近生产环境
- 只需一个进程

## 生产环境

### 构建

```bash
# 安装所有依赖
npm install
cd web && npm install && cd ..

# 构建
npm run build
```

构建产物：
- `dist/` - 后端编译结果
- `web/dist/` - 前端静态文件

### 运行

```bash
# 设置环境变量
export OPENAI_API_KEY="sk-..."
export PORT=3001

# 启动服务器
node dist/main.js
```

或使用 `.env` 文件：

```bash
node dist/main.js
```

### 使用 PM2 部署

```bash
npm install -g pm2

pm2 start dist/main.js --name salt-agent
pm2 save
pm2 startup
```

## Docker 部署

创建 `Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
COPY web/package*.json ./web/

# 安装依赖
RUN npm install
RUN cd web && npm install

# 复制源代码
COPY . .

# 构建
RUN npm run build

# 暴露端口
EXPOSE 3001

# 启动
CMD ["node", "dist/main.js"]
```

构建和运行：

```bash
docker build -t salt-agent .
docker run -d -p 3001:3001 -e OPENAI_API_KEY="sk-..." salt-agent
```

## 反向代理

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE 需要特殊配置
    location /api/chat/stream/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

### Caddy

```
your-domain.com {
    reverse_proxy localhost:3001
}
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | 无（必须） |
| `OPENAI_BASE_URL` | OpenAI API 地址 | `https://api.openai.com/v1` |
| `DEFAULT_MODEL` | 默认模型 | `gpt-4o` |
| `PORT` | 服务器端口 | `3000` |
| `SESSIONS_DIR` | 会话存储目录 | `./sessions` |

## 监控

### 日志

服务器日志输出到 stdout，使用 PM2 或 Docker 捕获：

```bash
# PM2
pm2 logs salt-agent

# Docker
docker logs -f container-id
```

### 健康检查

```bash
curl http://localhost:3001/api
```

应返回：
```json
{
  "name": "salt-agent",
  "version": "0.1.0",
  "endpoints": {...}
}
```

## 备份

会话数据存储在 `SESSIONS_DIR` 目录（默认 `./sessions`），定期备份该目录：

```bash
tar -czf sessions-backup-$(date +%Y%m%d).tar.gz sessions/
```

## 升级

```bash
# 拉取最新代码
git pull

# 重新安装依赖
npm install
cd web && npm install && cd ..

# 重新构建
npm run build

# 重启服务
pm2 restart salt-agent
```
