/**
 * Channel registry — manages all active messaging channels.
 *
 * The daemon registers channels here; the orchestrator can iterate them
 * to broadcast proactive notifications without knowing which channels exist.
 */

import type { Channel, MessageHandler } from "../types/channel.js";

export class ChannelRegistry {
  private channels = new Map<string, Channel>();

  /** Register a channel. Throws if the id is already registered. */
  register(channel: Channel): void {
    if (this.channels.has(channel.id)) {
      throw new Error(`Channel '${channel.id}' is already registered.`);
    }
    this.channels.set(channel.id, channel);
  }

  /** Get a channel by id, or undefined. */
  get(id: string): Channel | undefined {
    return this.channels.get(id);
  }

  /** All registered channels. */
  all(): Channel[] {
    return Array.from(this.channels.values());
  }

  /** Wire the same message handler to every registered channel. */
  onMessage(handler: MessageHandler): void {
    for (const ch of this.channels.values()) {
      ch.onMessage(handler);
    }
  }

  /** Start all registered channels. */
  async startAll(): Promise<void> {
    await Promise.all(
      Array.from(this.channels.values()).map((ch) => ch.start()),
    );
  }

  /** Stop all registered channels. */
  async stopAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.channels.values()).map((ch) => ch.stop()),
    );
  }

  /** Send a proactive message to a specific channel or all channels. */
  async broadcast(text: string, channelId?: string): Promise<void> {
    if (channelId) {
      const ch = this.channels.get(channelId);
      if (ch) await ch.sendMessage(text);
    } else {
      await Promise.allSettled(
        Array.from(this.channels.values()).map((ch) => ch.sendMessage(text)),
      );
    }
  }
}
