import { createAgentSession, SessionManager, AuthStorage, DefaultResourceLoader, createReadTool, createBashTool, createEditTool, createWriteTool, createGrepTool, createFindTool, createLsTool } from "@mariozechner/pi-coding-agent";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import { getDataDir, getWorkplaceDir } from "./config.js";
import type { SaltSettings } from "./server/routes/settings.js";

const SYSTEM_PROMPT = `你是Salt Agent中的AI助手，主要职责是帮助完成任务。

## 工作规范
- 语气风格：不主动用 emoji、简洁直接、优先编辑而非新建文件
- 代码修改规范：编辑前必须先读取，不生成二进制内容
- 工具使用规范：优先用专用工具而非终端命令，独立操作可并行调用
- 请使用中文回复`;

function buildModel(settings: SaltSettings): Model<"openai-completions"> {
  return {
    id: settings.model,
    name: settings.model,
    api: "openai-completions",
    provider: "salt-custom",
    baseUrl: settings.baseUrl.replace(/\/+$/, ""),
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
}

/**
 * 创建一个配置好的 agent session。
 * 共享 model 构建、auth、resource loader、系统提示词等所有通用逻辑。
 */
export async function createSaltSession(
  settings: SaltSettings,
  sessionFile: string,
): Promise<{ session: AgentSession }> {
  const cwd = getWorkplaceDir();

  const authStorage = new AuthStorage();
  authStorage.setRuntimeApiKey("salt-custom", settings.apiKey);

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getDataDir(),
    systemPrompt: SYSTEM_PROMPT,
  });
  await resourceLoader.reload();

  const sessionManager = SessionManager.open(sessionFile);

  const { session } = await createAgentSession({
    cwd,
    tools: [
      createReadTool(cwd),
      createBashTool(cwd),
      createEditTool(cwd),
      createWriteTool(cwd),
      createGrepTool(cwd),
      createFindTool(cwd),
      createLsTool(cwd),
    ],
    sessionManager,
    model: buildModel(settings),
    authStorage,
    resourceLoader,
  });

  return { session };
}
