/**
 * Abstract persistence interface.
 *
 * Decouples all data access from the concrete SQLite implementation so
 * alternative backends (Postgres, in-memory for tests, etc.) can be swapped in.
 */

export type MemoryCategory =
  | "preference"
  | "fact"
  | "project"
  | "person"
  | "routine";

export type ConversationRole = "user" | "assistant" | "system";

export type MemorySource = "user" | "auto";

export interface MemoryRecord {
  id: number;
  category: string;
  content: string;
  source: string;
  created_at: string;
}

export interface Store {
  // Key-value state
  getState(key: string): string | undefined;
  setState(key: string, value: string): void;
  deleteState(key: string): void;

  // Conversation log
  logConversation(
    role: ConversationRole,
    content: string,
    source: string,
  ): void;
  getRecentConversation(limit?: number): string;

  // Long-term memory
  addMemory(
    category: MemoryCategory,
    content: string,
    source?: MemorySource,
  ): number;
  searchMemories(
    keyword?: string,
    category?: string,
    limit?: number,
  ): MemoryRecord[];
  removeMemory(id: number): boolean;
  getMemorySummary(): string;

  // Worker session persistence
  saveWorkerSession(
    name: string,
    sessionId: string,
    workingDir: string,
  ): void;
  updateWorkerStatus(name: string, status: string): void;
  deleteWorkerSession(name: string): void;

  // Lifecycle
  close(): void;
}
