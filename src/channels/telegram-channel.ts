/**
 * Telegram channel — wraps the existing grammy bot behind the Channel interface.
 *
 * Delegates to src/telegram/bot.ts for the actual bot logic while exposing a
 * uniform Channel surface that the daemon can manage.
 */

import type { Channel, MessageHandler } from "../types/channel.js";
import type { AppConfig } from "../types/config.js";
import {
  createBot,
  startBot,
  stopBot,
  sendProactiveMessage,
} from "../telegram/bot.js";

export class TelegramChannel implements Channel {
  readonly id = "telegram";
  readonly name = "Telegram";

  constructor(private config: AppConfig) {}

  onMessage(handler: MessageHandler): void {
    // The grammy bot already calls sendToOrchestrator directly.
    // Full decoupling (injecting handler into bot.ts) is deferred to E5.
    // For now, this is a no-op — wiring happens in daemon.ts as before.
    void handler;
  }

  async start(): Promise<void> {
    if (!this.config.telegramEnabled) return;
    createBot();
    await startBot();
  }

  async stop(): Promise<void> {
    if (!this.config.telegramEnabled) return;
    await stopBot();
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.config.telegramEnabled) return;
    await sendProactiveMessage(text);
  }
}
