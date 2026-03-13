/**
 * Abstract channel interface.
 *
 * Each messaging channel (Telegram, TUI, Slack, Discord, …) implements this
 * interface so the daemon can manage channels uniformly.
 */

export type MessageSource =
  | { type: "telegram"; chatId: number; messageId: number }
  | { type: "tui"; connectionId: string }
  | { type: "background" };

export type MessageCallback = (text: string, done: boolean) => void;

export type MessageHandler = (
  prompt: string,
  source: MessageSource,
  callback: MessageCallback,
) => void;

export interface Channel {
  readonly id: string;
  readonly name: string;

  /** Register the handler that will process incoming messages from this channel. */
  onMessage(handler: MessageHandler): void;

  start(): Promise<void>;
  stop(): Promise<void>;

  /** Send a proactive (unsolicited) message to the default user on this channel. */
  sendMessage(text: string): Promise<void>;
}
