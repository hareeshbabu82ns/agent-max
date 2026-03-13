/**
 * Backward-compatible thin wrapper around SQLiteStore.
 *
 * New code should depend on the Store interface (from ../types/store.js)
 * and receive a Store instance via dependency injection.
 * These free-standing functions exist only so existing call-sites keep
 * working during the incremental migration.
 */

import { DB_PATH, ensureMaxHome } from "../paths.js";
import { SQLiteStore } from "./sqlite-store.js";
import type { Store } from "../types/store.js";

let store: SQLiteStore | undefined;

/** Get (or create) the singleton SQLiteStore. */
export function getStore(): Store {
  if (!store) {
    ensureMaxHome();
    store = new SQLiteStore(DB_PATH);
  }
  return store;
}

/**
 * @deprecated Use getStore() instead. Kept for legacy code that needs
 * the raw better-sqlite3 Database object during migration.
 */
export function getDb(): ReturnType<SQLiteStore["getRawDb"]> {
  const s = getStore() as SQLiteStore;
  return s.getRawDb();
}

// Re-export convenience functions that delegate to the singleton store.
// These will be removed once all consumers are migrated to Store DI.

export function getState(key: string): string | undefined {
  return getStore().getState(key);
}

export function setState(key: string, value: string): void {
  getStore().setState(key, value);
}

export function deleteState(key: string): void {
  getStore().deleteState(key);
}

export function logConversation(role: "user" | "assistant" | "system", content: string, source: string): void {
  getStore().logConversation(role, content, source);
}

export function getRecentConversation(limit = 20): string {
  return getStore().getRecentConversation(limit);
}

export function addMemory(
  category: "preference" | "fact" | "project" | "person" | "routine",
  content: string,
  source: "user" | "auto" = "user"
): number {
  return getStore().addMemory(category, content, source);
}

export function searchMemories(
  keyword?: string,
  category?: string,
  limit = 20
): { id: number; category: string; content: string; source: string; created_at: string }[] {
  return getStore().searchMemories(keyword, category, limit);
}

export function removeMemory(id: number): boolean {
  return getStore().removeMemory(id);
}

export function getMemorySummary(): string {
  return getStore().getMemorySummary();
}

export function closeDb(): void {
  if (store) {
    store.close();
    store = undefined;
  }
}
