/**
 * Session manager — handles provider lifecycle, health checking, and
 * orchestrator session creation / resumption.
 *
 * Extracted from orchestrator.ts so the session concerns are independently
 * testable and the orchestrator can focus on message routing.
 */

import { approveAll } from "@github/copilot-sdk";
import type { ModelProvider, AISession, CreateSessionOptions } from "../types/provider.js";
import type { ServiceContainer } from "../container.js";
import { getOrchestratorSystemMessage } from "./system-message.js";
import { DEFAULT_MODEL } from "../config.js";
import { SESSIONS_DIR } from "../paths.js";

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const ORCHESTRATOR_SESSION_KEY = "orchestrator_session_id";

export interface ToolsConfig {
  tools: unknown[];
  mcpServers: Record<string, unknown>;
  skillDirectories: string[];
}

export class SessionManager {
  private provider: ModelProvider;
  private session: AISession | undefined;
  private sessionPromise: Promise<AISession> | undefined;
  private resetPromise: Promise<ModelProvider> | undefined;
  private healthTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private container: ServiceContainer) {
    this.provider = container.provider;
  }

  getProvider(): ModelProvider {
    return this.provider;
  }

  // ------------------------------------------------------------------
  // Provider lifecycle
  // ------------------------------------------------------------------

  async ensureProvider(): Promise<ModelProvider> {
    if (this.provider.getState() === "connected") {
      return this.provider;
    }
    if (!this.resetPromise) {
      console.log(`[max] Client not connected (state: ${this.provider.getState()}), resetting…`);
      this.resetPromise = this.provider
        .reset()
        .then((p) => {
          console.log(`[max] Client reset successful, state: ${p.getState()}`);
          this.provider = p;
          return p;
        })
        .finally(() => {
          this.resetPromise = undefined;
        });
    }
    return this.resetPromise;
  }

  /** Validate configured model against available models. */
  async validateModel(): Promise<void> {
    try {
      const models = await this.provider.listModels();
      const configured = this.container.config.copilotModel;
      if (!models.some((m) => m.id === configured)) {
        console.log(
          `[max] ⚠️ Configured model '${configured}' is not available. Falling back to '${DEFAULT_MODEL}'.`,
        );
        this.container.config.copilotModel = DEFAULT_MODEL;
      }
    } catch (err) {
      console.log(
        `[max] Could not validate model (will use '${this.container.config.copilotModel}' as-is): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Health check
  // ------------------------------------------------------------------

  startHealthCheck(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(async () => {
      try {
        const state = this.provider.getState();
        if (state !== "connected") {
          console.log(`[max] Health check: client state is '${state}', resetting…`);
          await this.ensureProvider();
          this.session = undefined;
        }
      } catch (err) {
        console.error(
          `[max] Health check error:`,
          err instanceof Error ? err.message : err,
        );
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
  }

  // ------------------------------------------------------------------
  // Session management
  // ------------------------------------------------------------------

  /**
   * Get the current orchestrator session, creating or resuming one if needed.
   * @param getToolsConfig Factory that returns tools/mcpServers/skillDirectories
   *   for session creation. Called lazily only when a session must be created.
   */
  async getSession(getToolsConfig: () => ToolsConfig): Promise<AISession> {
    if (this.session) return this.session;
    if (this.sessionPromise) return this.sessionPromise;

    this.sessionPromise = this.createOrResumeSession(getToolsConfig);
    try {
      this.session = await this.sessionPromise;
      return this.session;
    } finally {
      this.sessionPromise = undefined;
    }
  }

  /** Invalidate the current session (e.g. after a fatal error). */
  invalidateSession(): void {
    this.session = undefined;
    this.container.store.deleteState(ORCHESTRATOR_SESSION_KEY);
  }

  /** Abort the current in-flight request on the active session. */
  async abortSession(): Promise<boolean> {
    if (this.session) {
      try {
        await this.session.abort();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------
  // Internal: session creation / resumption
  // ------------------------------------------------------------------

  private async createOrResumeSession(
    getToolsConfig: () => ToolsConfig,
  ): Promise<AISession> {
    const provider = await this.ensureProvider();
    const { tools, mcpServers, skillDirectories } = getToolsConfig();
    const memorySummary = this.container.store.getMemorySummary();

    const baseOpts: CreateSessionOptions = {
      model: this.container.config.copilotModel,
      configDir: SESSIONS_DIR,
      streaming: true,
      systemMessage: {
        content: getOrchestratorSystemMessage(memorySummary || undefined, {
          selfEditEnabled: this.container.config.selfEditEnabled,
        }),
      },
      tools,
      mcpServers,
      skillDirectories,
      onPermissionRequest: approveAll,
      infiniteSessions: {
        enabled: true,
        backgroundCompactionThreshold: 0.8,
        bufferExhaustionThreshold: 0.95,
      },
    };

    // Try to resume a previous session
    const savedId = this.container.store.getState(ORCHESTRATOR_SESSION_KEY);
    if (savedId) {
      try {
        console.log(
          `[max] Resuming orchestrator session ${savedId.slice(0, 8)}…`,
        );
        const session = await provider.resumeSession(savedId, baseOpts);
        console.log(`[max] Resumed orchestrator session successfully`);
        return session;
      } catch (err) {
        console.log(
          `[max] Could not resume session: ${err instanceof Error ? err.message : err}. Creating new.`,
        );
        this.container.store.deleteState(ORCHESTRATOR_SESSION_KEY);
      }
    }

    // Create a fresh session
    console.log(`[max] Creating new persistent orchestrator session`);
    const session = await provider.createSession(baseOpts);
    this.container.store.setState(
      ORCHESTRATOR_SESSION_KEY,
      session.sessionId,
    );
    console.log(
      `[max] Created orchestrator session ${session.sessionId.slice(0, 8)}…`,
    );

    // Recover conversation context if available
    const recentHistory = this.container.store.getRecentConversation(10);
    if (recentHistory) {
      console.log(
        `[max] Injecting recent conversation context into new session`,
      );
      try {
        await session.sendAndWait(
          {
            prompt: `[System: Session recovered] Your previous session was lost. Here's the recent conversation for context — do NOT respond to these messages, just absorb the context silently:\n\n${recentHistory}\n\n(End of recovery context. Wait for the next real message.)`,
          },
          60_000,
        );
      } catch (err) {
        console.log(
          `[max] Context recovery injection failed (non-fatal): ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return session;
  }
}
