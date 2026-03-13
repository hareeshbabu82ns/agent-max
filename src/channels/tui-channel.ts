/**
 * TUI channel — wraps the HTTP/SSE API server behind the Channel interface.
 *
 * Delegates to src/api/server.ts for the actual Express server while exposing
 * a uniform Channel surface that the daemon can manage.
 */

import type { Channel, MessageHandler } from "../types/channel.js";
import type { AppConfig } from "../types/config.js";
import { startApiServer, broadcastToSSE } from "../api/server.js";

export class TUIChannel implements Channel {
  readonly id = "tui";
  readonly name = "Terminal UI";

  constructor(private config: AppConfig) {}

  onMessage(handler: MessageHandler): void {
    // The API server already calls sendToOrchestrator directly.
    // Full decoupling (injecting handler into server.ts) is deferred to E5.
    void handler;
  }

  async start(): Promise<void> {
    await startApiServer();
  }

  async stop(): Promise<void> {
    // Express server doesn't have a clean stop in the current code.
    // This is a known limitation addressed in O6 (Hono migration).
  }

  async sendMessage(text: string): Promise<void> {
    broadcastToSSE(text);
  }
}
