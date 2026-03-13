/**
 * Application configuration shape.
 *
 * Makes the config injectable so that modules don't import a global singleton
 * and tests can supply their own values.
 */

export interface AppConfig {
  readonly telegramBotToken: string | undefined;
  readonly authorizedUserId: number | undefined;
  readonly apiPort: number;
  readonly workerTimeoutMs: number;
  readonly telegramEnabled: boolean;
  readonly selfEditEnabled: boolean;
  copilotModel: string;
}
