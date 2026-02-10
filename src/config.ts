/**
 * Infrastructure and credential configuration (from environment variables).
 * Runtime configuration (model, thinking, compaction, retry) is managed by SettingsManager.
 */
export const config = {
  /** Server port */
  port: parseInt(process.env.PORT || "3000", 10),
  /** Directory for session JSONL files */
  sessionsDir: process.env.SESSIONS_DIR || "./sessions",
  /** Agent config directory (settings.json, auth.json, models.json) */
  agentDir: process.env.AGENT_DIR || ".salt-agent",
  /** OpenAI API key */
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  /** OpenAI base URL (for OpenAI-compatible services) */
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  /** Skill directories (comma-separated) */
  skillDirs: (process.env.SKILL_DIRS || "").split(",").filter(Boolean),
};
