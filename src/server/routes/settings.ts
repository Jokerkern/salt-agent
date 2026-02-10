import fs from "fs/promises";
import path from "path";
import { Hono } from "hono";
import { getSettingsPath } from "../../config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SaltSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}

const DEFAULT_SETTINGS: SaltSettings = {
  baseUrl: "",
  apiKey: "",
  model: "",
  systemPrompt: "请使用中文回复。回答要简洁、准确，避免不必要的废话。",
};

// ─── Persistence ─────────────────────────────────────────────────────────────

export async function loadSettings(): Promise<SaltSettings> {
  try {
    const raw = await fs.readFile(getSettingsPath(), "utf-8");
    const data = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...data };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings: SaltSettings): Promise<void> {
  const filePath = getSettingsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), "utf-8");
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export function createSettingsRoutes() {
  const app = new Hono();

  // Get current settings (apiKey masked)
  app.get("/", async (c) => {
    const settings = await loadSettings();
    return c.json({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey ? maskKey(settings.apiKey) : "",
      model: settings.model,
      systemPrompt: settings.systemPrompt,
      hasApiKey: !!settings.apiKey,
    });
  });

  // Save settings
  app.post("/", async (c) => {
    const body = await c.req.json();
    const current = await loadSettings();

    const updated: SaltSettings = {
      baseUrl: body.baseUrl ?? current.baseUrl,
      // If apiKey is not provided or is the masked version, keep current
      apiKey: (body.apiKey && !body.apiKey.includes("***")) ? body.apiKey : current.apiKey,
      model: body.model ?? current.model,
      systemPrompt: body.systemPrompt ?? current.systemPrompt,
    };

    await saveSettings(updated);
    return c.json({
      success: true,
      baseUrl: updated.baseUrl,
      apiKey: updated.apiKey ? maskKey(updated.apiKey) : "",
      model: updated.model,
      systemPrompt: updated.systemPrompt,
      hasApiKey: !!updated.apiKey,
    });
  });

  // Fetch models from the configured (or provided) base URL
  app.post("/fetch-models", async (c) => {
    const body = await c.req.json();
    const current = await loadSettings();

    const baseUrl = (body.baseUrl ?? current.baseUrl)?.replace(/\/+$/, "");
    const apiKey = (body.apiKey && !body.apiKey.includes("***")) ? body.apiKey : current.apiKey;

    if (!baseUrl) {
      return c.json({ error: "Base URL is required" }, 400);
    }
    if (!apiKey) {
      return c.json({ error: "API Key is required" }, 400);
    }

    try {
      // Try /v1/models first, then /models
      let modelsUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
      let res = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        // Fallback: try /models directly
        modelsUrl = `${baseUrl}/models`;
        res = await fetch(modelsUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return c.json({ error: `Failed to fetch models: HTTP ${res.status} ${text}` }, 502);
      }

      const data: any = await res.json();
      const models: Array<{ id: string; name: string }> = [];

      if (data.data && Array.isArray(data.data)) {
        // OpenAI format: { data: [{ id: "gpt-4", ... }] }
        for (const m of data.data) {
          models.push({ id: m.id, name: m.id });
        }
      } else if (Array.isArray(data)) {
        // Some APIs return a plain array
        for (const m of data) {
          models.push({ id: m.id ?? m, name: m.name ?? m.id ?? m });
        }
      }

      models.sort((a, b) => a.id.localeCompare(b.id));

      return c.json({ models });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json({ error: `Failed to connect: ${msg}` }, 502);
    }
  });

  return app;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return key.slice(0, 4) + "***" + key.slice(-4);
}
