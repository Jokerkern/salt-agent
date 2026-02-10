import fs from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

export interface SessionMetadata {
  id: string;
  title?: string;
  source: "web" | "im";
  createdAt: number;
  updatedAt: number;
  userId?: string;
}

/**
 * Manages session metadata and session file paths.
 *
 * Session message persistence is handled by pi-coding-agent's SessionManager
 * (one JSONL file per session managed by the runner). This class manages:
 * - Session metadata (title, source, timestamps) in separate .meta.json files
 * - Session ID allocation and directory structure
 * - Listing / deleting sessions
 */
export class SaltSessionManager {
  constructor(private sessionsDir: string) {}

  async init() {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /** Get the JSONL session file path for pi-coding-agent's SessionManager */
  getSessionFile(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  /** Get the metadata file path */
  private getMetadataFile(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.meta.json`);
  }

  async createSession(source: "web" | "im", userId?: string, title?: string): Promise<string> {
    const id = nanoid();
    const metadata: SessionMetadata = {
      id,
      title: title ? title.slice(0, 50).trim() : undefined,
      source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId,
    };

    await fs.writeFile(this.getMetadataFile(id), JSON.stringify(metadata, null, 2), "utf-8");
    return id;
  }

  async getMetadata(sessionId: string): Promise<SessionMetadata | null> {
    try {
      const content = await fs.readFile(this.getMetadataFile(sessionId), "utf-8");
      return JSON.parse(content);
    } catch (error) {
      if ((error as any).code === "ENOENT") return null;
      throw error;
    }
  }

  async updateMetadata(sessionId: string, metadata: SessionMetadata) {
    await fs.writeFile(this.getMetadataFile(sessionId), JSON.stringify(metadata, null, 2), "utf-8");
  }

  /** Update the title from first user message if not already set */
  async updateTitleIfNeeded(sessionId: string, message: AgentMessage) {
    const metadata = await this.getMetadata(sessionId);
    if (!metadata) return;

    metadata.updatedAt = Date.now();
    if (!metadata.title && message.role === "user") {
      metadata.title = this.extractTitle(message);
    }
    await this.updateMetadata(sessionId, metadata);
  }

  private extractTitle(message: AgentMessage): string {
    if ("content" in message) {
      if (Array.isArray(message.content)) {
        const textPart = message.content.find((c: any) => c.type === "text");
        if (textPart && "text" in textPart) {
          return (textPart as any).text.slice(0, 50).trim() || "新会话";
        }
      } else if (typeof message.content === "string") {
        return message.content.slice(0, 50).trim() || "新会话";
      }
    }
    return "新会话";
  }

  async listSessions(): Promise<SessionMetadata[]> {
    const files = await fs.readdir(this.sessionsDir);
    const sessions: SessionMetadata[] = [];

    for (const file of files) {
      if (file.endsWith(".meta.json")) {
        const sessionId = file.replace(".meta.json", "");
        const metadata = await this.getMetadata(sessionId);
        if (metadata) {
          sessions.push(metadata);
        }
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    let deleted = false;

    // Delete metadata file
    try {
      await fs.unlink(this.getMetadataFile(sessionId));
      deleted = true;
    } catch (error) {
      if ((error as any).code !== "ENOENT") throw error;
    }

    // Delete session JSONL file
    try {
      await fs.unlink(this.getSessionFile(sessionId));
      deleted = true;
    } catch (error) {
      if ((error as any).code !== "ENOENT") throw error;
    }

    return deleted;
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    try {
      await fs.access(this.getMetadataFile(sessionId));
      return true;
    } catch {
      return false;
    }
  }

  /** Read messages from a session file (for the sessions API) */
  async getMessages(sessionId: string): Promise<AgentMessage[]> {
    const { SessionManager } = await import("@mariozechner/pi-coding-agent");
    const sessionFile = this.getSessionFile(sessionId);
    try {
      await fs.access(sessionFile);
    } catch {
      return [];
    }
    const sm = SessionManager.open(sessionFile);
    const ctx = sm.buildSessionContext();
    return ctx.messages;
  }
}
