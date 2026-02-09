import fs from "fs/promises";
import path from "path";
import type { AgentMessage } from "../agent/types.js";
import { nanoid } from "nanoid";

export interface SessionMetadata {
  id: string;
  source: "web" | "im";
  createdAt: number;
  updatedAt: number;
  userId?: string;
}

export class SessionManager {
  constructor(private sessionsDir: string) {}

  async init() {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  async createSession(source: "web" | "im", userId?: string): Promise<string> {
    const id = nanoid();
    const metadata: SessionMetadata = {
      id,
      source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId,
    };

    const sessionPath = path.join(this.sessionsDir, `${id}.jsonl`);
    await fs.writeFile(sessionPath, JSON.stringify({ type: "metadata", data: metadata }) + "\n", "utf-8");

    return id;
  }

  async appendMessage(sessionId: string, message: AgentMessage) {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    const entry = JSON.stringify({ type: "message", data: message }) + "\n";
    await fs.appendFile(sessionPath, entry, "utf-8");
    
    // Update metadata timestamp
    const metadata = await this.getMetadata(sessionId);
    if (metadata) {
      metadata.updatedAt = Date.now();
      await this.updateMetadata(sessionId, metadata);
    }
  }

  async getMessages(sessionId: string): Promise<AgentMessage[]> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    try {
      const content = await fs.readFile(sessionPath, "utf-8");
      const lines = content.trim().split("\n");
      const messages: AgentMessage[] = [];

      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.type === "message") {
          messages.push(entry.data);
        }
      }

      return messages;
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async getMetadata(sessionId: string): Promise<SessionMetadata | null> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    try {
      const content = await fs.readFile(sessionPath, "utf-8");
      const firstLine = content.split("\n")[0];
      if (!firstLine) return null;
      
      const entry = JSON.parse(firstLine);
      if (entry.type === "metadata") {
        return entry.data;
      }
      return null;
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async updateMetadata(sessionId: string, metadata: SessionMetadata) {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    const content = await fs.readFile(sessionPath, "utf-8");
    const lines = content.trim().split("\n");
    
    lines[0] = JSON.stringify({ type: "metadata", data: metadata });
    await fs.writeFile(sessionPath, lines.join("\n") + "\n", "utf-8");
  }

  async listSessions(): Promise<SessionMetadata[]> {
    const files = await fs.readdir(this.sessionsDir);
    const sessions: SessionMetadata[] = [];

    for (const file of files) {
      if (file.endsWith(".jsonl")) {
        const sessionId = file.replace(".jsonl", "");
        const metadata = await this.getMetadata(sessionId);
        if (metadata) {
          sessions.push(metadata);
        }
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    try {
      await fs.access(sessionPath);
      return true;
    } catch {
      return false;
    }
  }
}
