/**
 * Copilot SDK implementation of the ModelProvider interface.
 *
 * Wraps @github/copilot-sdk CopilotClient / CopilotSession behind the
 * abstract ModelProvider / AISession interfaces so the orchestrator and
 * tools don't depend on the SDK directly.
 */

import {
  CopilotClient,
  approveAll,
  type CopilotSession,
} from "@github/copilot-sdk";
import type {
  ModelProvider,
  ModelInfo,
  AISession,
  CreateSessionOptions,
} from "../types/provider.js";

// ------------------------------------------------------------------
// AISession wrapper
// ------------------------------------------------------------------

class CopilotAISession implements AISession {
  constructor(private session: CopilotSession) {}

  get sessionId(): string {
    return this.session.sessionId;
  }

  async sendAndWait(
    opts: { prompt: string },
    timeoutMs: number,
  ): Promise<{ data?: { content: string } } | undefined> {
    return this.session.sendAndWait(opts, timeoutMs) as any;
  }

  on(event: string, handler: (event: any) => void): () => void {
    return this.session.on(event as any, handler as any);
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  async destroy(): Promise<void> {
    await this.session.destroy();
  }
}

// ------------------------------------------------------------------
// ModelProvider implementation
// ------------------------------------------------------------------

export class CopilotProvider implements ModelProvider {
  readonly name = "copilot";
  private client: CopilotClient | undefined;

  getState(): string {
    return this.client?.getState() ?? "disconnected";
  }

  async start(): Promise<void> {
    if (!this.client) {
      this.client = new CopilotClient({
        autoStart: true,
        autoRestart: true,
      });
      await this.client.start();
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = undefined;
    }
  }

  async reset(): Promise<ModelProvider> {
    if (this.client) {
      try {
        await this.client.stop();
      } catch {
        /* best-effort */
      }
      this.client = undefined;
    }
    await this.start();
    return this;
  }

  async listModels(): Promise<ModelInfo[]> {
    this.ensureClient();
    return this.client!.listModels() as Promise<ModelInfo[]>;
  }

  async createSession(options: CreateSessionOptions): Promise<AISession> {
    this.ensureClient();
    const session = await this.client!.createSession(
      this.toSdkOptions(options),
    );
    return new CopilotAISession(session);
  }

  async resumeSession(
    sessionId: string,
    options: CreateSessionOptions,
  ): Promise<AISession> {
    this.ensureClient();
    const session = await this.client!.resumeSession(
      sessionId,
      this.toSdkOptions(options),
    );
    return new CopilotAISession(session);
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private ensureClient(): void {
    if (!this.client) {
      throw new Error("CopilotProvider not started. Call start() first.");
    }
  }

  private toSdkOptions(options: CreateSessionOptions): Record<string, any> {
    const sdk: Record<string, any> = {
      model: options.model,
      onPermissionRequest: options.onPermissionRequest ?? approveAll,
    };
    if (options.configDir) sdk.configDir = options.configDir;
    if (options.workingDirectory) sdk.workingDirectory = options.workingDirectory;
    if (options.streaming !== undefined) sdk.streaming = options.streaming;
    if (options.systemMessage) sdk.systemMessage = options.systemMessage;
    if (options.tools) sdk.tools = options.tools;
    if (options.mcpServers) sdk.mcpServers = options.mcpServers;
    if (options.skillDirectories) sdk.skillDirectories = options.skillDirectories;
    if (options.infiniteSessions) sdk.infiniteSessions = options.infiniteSessions;
    return sdk;
  }
}
