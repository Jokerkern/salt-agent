import { Agent, type AgentOptions } from "../agent/agent.js";
import type { AgentMessage } from "../agent/types.js";
import { SessionManager } from "./session-manager.js";

export class AgentSession {
  private agent: Agent;
  private sessionManager: SessionManager;
  private sessionId: string;

  constructor(sessionId: string, sessionManager: SessionManager, agentOptions: AgentOptions) {
    this.sessionId = sessionId;
    this.sessionManager = sessionManager;
    this.agent = new Agent(agentOptions);
    
    this.agent.sessionId = sessionId;
    
    // Subscribe to message_end events to persist messages
    this.agent.subscribe((event) => {
      if (event.type === "message_end") {
        this.sessionManager.appendMessage(sessionId, event.message).catch((err) => {
          console.error("Failed to persist message:", err);
        });
      }
    });
  }

  getAgent(): Agent {
    return this.agent;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async loadMessages() {
    const messages = await this.sessionManager.getMessages(this.sessionId);
    this.agent.replaceMessages(messages);
  }

  async prompt(input: string | AgentMessage | AgentMessage[]) {
    await this.agent.prompt(input as any);
  }
}
