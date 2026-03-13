import type {
  Store,
  MemoryCategory,
  ConversationRole,
  MemorySource,
  MemoryRecord,
} from "../types/store.js";

/**
 * In-memory implementation of the Store interface for unit testing.
 *
 * No filesystem or database dependencies — all data lives in plain Maps/arrays.
 */
export class InMemoryStore implements Store {
  private state = new Map<string, string>();
  private conversationLog: {
    id: number;
    role: ConversationRole;
    content: string;
    source: string;
    ts: string;
  }[] = [];
  private memories: (MemoryRecord & { last_accessed: string })[] = [];
  private workerSessions = new Map<
    string,
    { sessionId: string; workingDir: string; status: string }
  >();
  private nextConvId = 1;
  private nextMemId = 1;

  // ------------------------------------------------------------------
  // Key-value state
  // ------------------------------------------------------------------

  getState(key: string): string | undefined {
    return this.state.get(key);
  }

  setState(key: string, value: string): void {
    this.state.set(key, value);
  }

  deleteState(key: string): void {
    this.state.delete(key);
  }

  // ------------------------------------------------------------------
  // Conversation log
  // ------------------------------------------------------------------

  logConversation(
    role: ConversationRole,
    content: string,
    source: string,
  ): void {
    this.conversationLog.push({
      id: this.nextConvId++,
      role,
      content,
      source,
      ts: new Date().toISOString(),
    });
    // Keep last 200 entries
    if (this.conversationLog.length > 200) {
      this.conversationLog = this.conversationLog.slice(-200);
    }
  }

  getRecentConversation(limit = 20): string {
    const rows = this.conversationLog.slice(-limit);
    if (rows.length === 0) return "";

    return rows
      .map((r) => {
        const tag =
          r.role === "user"
            ? `[${r.source}] User`
            : r.role === "system"
              ? `[${r.source}] System`
              : "Max";
        const content =
          r.content.length > 500 ? r.content.slice(0, 500) + "…" : r.content;
        return `${tag}: ${content}`;
      })
      .join("\n\n");
  }

  // ------------------------------------------------------------------
  // Long-term memory
  // ------------------------------------------------------------------

  addMemory(
    category: MemoryCategory,
    content: string,
    source: MemorySource = "user",
  ): number {
    const id = this.nextMemId++;
    const now = new Date().toISOString();
    this.memories.push({
      id,
      category,
      content,
      source,
      created_at: now,
      last_accessed: now,
    });
    return id;
  }

  searchMemories(
    keyword?: string,
    category?: string,
    limit = 20,
  ): MemoryRecord[] {
    let results = [...this.memories];

    if (keyword) {
      const lower = keyword.toLowerCase();
      results = results.filter((m) =>
        m.content.toLowerCase().includes(lower),
      );
    }
    if (category) {
      results = results.filter((m) => m.category === category);
    }

    // Sort by last_accessed descending
    results.sort(
      (a, b) =>
        new Date(b.last_accessed).getTime() -
        new Date(a.last_accessed).getTime(),
    );
    results = results.slice(0, limit);

    // Update last_accessed
    const now = new Date().toISOString();
    for (const r of results) {
      const mem = this.memories.find((m) => m.id === r.id);
      if (mem) mem.last_accessed = now;
    }

    return results.map(({ last_accessed: _, ...rest }) => rest);
  }

  removeMemory(id: number): boolean {
    const idx = this.memories.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this.memories.splice(idx, 1);
    return true;
  }

  getMemorySummary(): string {
    if (this.memories.length === 0) return "";

    const grouped: Record<string, { id: number; content: string }[]> = {};
    for (const r of this.memories) {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push({ id: r.id, content: r.content });
    }

    const sections = Object.entries(grouped).map(([cat, items]) => {
      const lines = items
        .map((i) => `  - [#${i.id}] ${i.content}`)
        .join("\n");
      return `**${cat}**:\n${lines}`;
    });

    return sections.join("\n");
  }

  // ------------------------------------------------------------------
  // Worker session persistence
  // ------------------------------------------------------------------

  saveWorkerSession(
    name: string,
    sessionId: string,
    workingDir: string,
  ): void {
    this.workerSessions.set(name, {
      sessionId,
      workingDir,
      status: "idle",
    });
  }

  updateWorkerStatus(name: string, status: string): void {
    const ws = this.workerSessions.get(name);
    if (ws) ws.status = status;
  }

  deleteWorkerSession(name: string): void {
    this.workerSessions.delete(name);
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  close(): void {
    // No-op for in-memory store
  }
}
