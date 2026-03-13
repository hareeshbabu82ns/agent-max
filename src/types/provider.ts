/**
 * Abstract model provider interface.
 *
 * Decouples the orchestrator from any specific LLM SDK (Copilot, OpenAI, etc.).
 * Each provider implements this interface; the orchestrator interacts through it.
 */

export interface ModelInfo {
  id: string;
  name?: string;
  billing?: { multiplier: number };
}

export interface SessionResponse {
  data?: { content: string };
}

export interface AISession {
  readonly sessionId: string;

  sendAndWait(
    opts: { prompt: string },
    timeoutMs: number,
  ): Promise<SessionResponse | undefined>;

  /** Subscribe to session events. Returns an unsubscribe function. */
  on(event: string, handler: (event: any) => void): () => void;

  abort(): Promise<void>;
  destroy(): Promise<void>;
}

export interface CreateSessionOptions {
  model: string;
  configDir?: string;
  workingDirectory?: string;
  streaming?: boolean;
  systemMessage?: { content: string };
  tools?: unknown[];
  mcpServers?: Record<string, unknown>;
  skillDirectories?: string[];
  onPermissionRequest?: (...args: any[]) => any;
  infiniteSessions?: {
    enabled: boolean;
    backgroundCompactionThreshold?: number;
    bufferExhaustionThreshold?: number;
  };
}

export interface ModelProvider {
  readonly name: string;

  getState(): string;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<ModelProvider>;

  listModels(): Promise<ModelInfo[]>;
  createSession(options: CreateSessionOptions): Promise<AISession>;
  resumeSession(
    sessionId: string,
    options: CreateSessionOptions,
  ): Promise<AISession>;
}
