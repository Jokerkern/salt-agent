import type { IMResponse } from "./types.js";

export class IMAdapter {
  async sendCallback(callbackUrl: string, response: IMResponse): Promise<void> {
    try {
      const res = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(response),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (error) {
      console.error("Failed to send callback:", error);
      throw error;
    }
  }
}
