export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  sessionsDir: process.env.SESSIONS_DIR || "./sessions",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  defaultModel: process.env.DEFAULT_MODEL || "gpt-4o",
};
