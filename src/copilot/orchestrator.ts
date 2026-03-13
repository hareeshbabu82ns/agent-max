/**
 * Orchestrator — message routing, queuing, and execution.
 *
 * Session lifecycle (provider management, health checks, session creation /
 * resumption) is delegated to SessionManager.
 */

import type { MessageSource, MessageCallback } from "../types/channel.js";
import type { ServiceContainer } from "../container.js";
import { createTools, type WorkerInfo } from "./tools.js";
import { loadMcpConfig } from "./mcp-config.js";
import { SessionManager, type ToolsConfig } from "./session-manager.js";

export type { MessageSource, MessageCallback };

const MAX_RETRIES = 3;
const RECONNECT_DELAYS_MS = [1_000, 3_000, 10_000];

// ------------------------------------------------------------------
// Logging & notification callbacks
// ------------------------------------------------------------------

type LogFn = (direction: "in" | "out", source: string, text: string) => void;
let logMessage: LogFn = () => {};

export function setMessageLogger(fn: LogFn): void {
  logMessage = fn;
}

type ProactiveNotifyFn = (text: string, channel?: "telegram" | "tui") => void;
let proactiveNotifyFn: ProactiveNotifyFn | undefined;

export function setProactiveNotify(fn: ProactiveNotifyFn): void {
  proactiveNotifyFn = fn;
}

// ------------------------------------------------------------------
// Module state
// ------------------------------------------------------------------

let container: ServiceContainer;
let sessionMgr: SessionManager;
const workers = new Map<string, WorkerInfo>();

// Message queue — serializes access to the single persistent session
type QueuedMessage = {
  prompt: string;
  callback: MessageCallback;
  sourceChannel?: "telegram" | "tui";
  resolve: (value: string) => void;
  reject: (err: unknown) => void;
};
const messageQueue: QueuedMessage[] = [];
let processing = false;
let currentCallback: MessageCallback | undefined;
let currentSourceChannel: "telegram" | "tui" | undefined;

/** Get the channel that originated the message currently being processed. */
export function getCurrentSourceChannel(): "telegram" | "tui" | undefined {
  return currentSourceChannel;
}

// ------------------------------------------------------------------
// Tool configuration factory
// ------------------------------------------------------------------

function getToolsConfig(): ToolsConfig {
  const tools = createTools({
    provider: sessionMgr.getProvider(),
    store: container.store,
    config: container.config,
    skills: container.skills,
    persistModel: container.persistModel,
    workers,
    onWorkerComplete: feedBackgroundResult,
    getCurrentSourceChannel,
  });
  return {
    tools,
    mcpServers: loadMcpConfig(),
    skillDirectories: container.skills.getSkillDirectories(),
  };
}

// ------------------------------------------------------------------
// Worker coordination
// ------------------------------------------------------------------

/** Feed a background worker result into the orchestrator as a new turn. */
export function feedBackgroundResult(workerName: string, result: string): void {
  const channel = workers.get(workerName)?.originChannel;
  const prompt = `[Background task completed] Worker '${workerName}' finished:\n\n${result}`;
  sendToOrchestrator(
    prompt,
    { type: "background" },
    (_text, done) => {
      if (done && proactiveNotifyFn) {
        proactiveNotifyFn(_text, channel);
      }
    },
  );
}

export function getWorkers(): Map<string, WorkerInfo> {
  return workers;
}

// ------------------------------------------------------------------
// Message execution
// ------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeOnSession(
  prompt: string,
  callback: MessageCallback,
): Promise<string> {
  const session = await sessionMgr.getSession(getToolsConfig);
  currentCallback = callback;

  let accumulated = "";
  let toolCallExecuted = false;
  const unsubToolDone = session.on("tool.execution_complete", () => {
    toolCallExecuted = true;
  });
  const unsubDelta = session.on("assistant.message_delta", (event) => {
    if (
      toolCallExecuted &&
      accumulated.length > 0 &&
      !accumulated.endsWith("\n")
    ) {
      accumulated += "\n";
    }
    toolCallExecuted = false;
    accumulated += event.data.deltaContent;
    callback(accumulated, false);
  });

  try {
    const result = await session.sendAndWait({ prompt }, 300_000);
    return result?.data?.content || accumulated || "(No response)";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/closed|destroy|disposed|invalid|expired|not found/i.test(msg)) {
      console.log(`[max] Session appears dead, will recreate: ${msg}`);
      sessionMgr.invalidateSession();
    }
    throw err;
  } finally {
    unsubDelta();
    unsubToolDone();
    currentCallback = undefined;
  }
}

// ------------------------------------------------------------------
// Message queue
// ------------------------------------------------------------------

async function processQueue(): Promise<void> {
  if (processing) {
    if (messageQueue.length > 0) {
      console.log(
        `[max] Message queued (${messageQueue.length} waiting — orchestrator is busy)`,
      );
    }
    return;
  }
  processing = true;

  while (messageQueue.length > 0) {
    const item = messageQueue.shift()!;
    currentSourceChannel = item.sourceChannel;
    try {
      const result = await executeOnSession(item.prompt, item.callback);
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
    currentSourceChannel = undefined;
  }

  processing = false;
}

function isRecoverableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|disconnect|connection|EPIPE|ECONNRESET|ECONNREFUSED|socket|closed|ENOENT|spawn|not found|expired|stale/i.test(
    msg,
  );
}

export async function sendToOrchestrator(
  prompt: string,
  source: MessageSource,
  callback: MessageCallback,
): Promise<void> {
  const sourceLabel =
    source.type === "telegram"
      ? "telegram"
      : source.type === "tui"
        ? "tui"
        : "background";
  logMessage("in", sourceLabel, prompt);

  const taggedPrompt =
    source.type === "background" ? prompt : `[via ${sourceLabel}] ${prompt}`;
  const logRole = source.type === "background" ? "system" : "user";
  const sourceChannel: "telegram" | "tui" | undefined =
    source.type === "telegram"
      ? "telegram"
      : source.type === "tui"
        ? "tui"
        : undefined;

  void (async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const finalContent = await new Promise<string>((resolve, reject) => {
          messageQueue.push({
            prompt: taggedPrompt,
            callback,
            sourceChannel,
            resolve,
            reject,
          });
          processQueue();
        });
        callback(finalContent, true);
        try {
          logMessage("out", sourceLabel, finalContent);
        } catch {
          /* best-effort */
        }
        try {
          container.store.logConversation(
            logRole as "user" | "assistant" | "system",
            prompt,
            sourceLabel,
          );
        } catch {
          /* best-effort */
        }
        try {
          container.store.logConversation(
            "assistant",
            finalContent,
            sourceLabel,
          );
        } catch {
          /* best-effort */
        }
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (/cancelled|abort/i.test(msg)) return;

        if (isRecoverableError(err) && attempt < MAX_RETRIES) {
          const delay =
            RECONNECT_DELAYS_MS[
              Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)
            ];
          console.error(
            `[max] Recoverable error: ${msg}. Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms…`,
          );
          await sleep(delay);
          try {
            await sessionMgr.ensureProvider();
          } catch {
            /* will fail again on next attempt */
          }
          continue;
        }

        console.error(`[max] Error processing message: ${msg}`);
        callback(`Error: ${msg}`, true);
        return;
      }
    }
  })();
}

// ------------------------------------------------------------------
// Cancel & init
// ------------------------------------------------------------------

export async function cancelCurrentMessage(): Promise<boolean> {
  const drained = messageQueue.length;
  while (messageQueue.length > 0) {
    messageQueue.shift()!.reject(new Error("Cancelled"));
  }

  if (currentCallback) {
    try {
      const aborted = await sessionMgr.abortSession();
      if (aborted) {
        console.log(`[max] Aborted in-flight request`);
        return true;
      }
    } catch (err) {
      console.error(
        `[max] Abort failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return drained > 0;
}

export async function initOrchestrator(
  svc: ServiceContainer,
): Promise<void> {
  container = svc;
  sessionMgr = new SessionManager(svc);

  await sessionMgr.validateModel();

  const { mcpServers, skillDirectories } = getToolsConfig();
  console.log(
    `[max] Loading ${Object.keys(mcpServers).length} MCP server(s): ${Object.keys(mcpServers).join(", ") || "(none)"}`,
  );
  console.log(
    `[max] Skill directories: ${skillDirectories.join(", ") || "(none)"}`,
  );
  console.log(
    `[max] Persistent session mode — conversation history maintained by SDK`,
  );

  sessionMgr.startHealthCheck();

  try {
    await sessionMgr.getSession(getToolsConfig);
  } catch (err) {
    console.error(
      `[max] Failed to create initial session (will retry on first message):`,
      err instanceof Error ? err.message : err,
    );
  }
}

