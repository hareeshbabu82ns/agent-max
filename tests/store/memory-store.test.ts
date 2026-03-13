import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore } from "../../src/store/memory-store.js";

describe("InMemoryStore", () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  // ------------------------------------------------------------------
  // Key-value state
  // ------------------------------------------------------------------

  describe("state", () => {
    it("returns undefined for missing keys", () => {
      expect(store.getState("nope")).toBeUndefined();
    });

    it("sets and gets a value", () => {
      store.setState("k", "v");
      expect(store.getState("k")).toBe("v");
    });

    it("overwrites existing keys", () => {
      store.setState("k", "a");
      store.setState("k", "b");
      expect(store.getState("k")).toBe("b");
    });

    it("deletes keys", () => {
      store.setState("k", "v");
      store.deleteState("k");
      expect(store.getState("k")).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // Memory
  // ------------------------------------------------------------------

  describe("memory", () => {
    it("adds and searches memories", () => {
      const id = store.addMemory("fact", "TS is great");
      expect(id).toBeGreaterThan(0);

      const results = store.searchMemories("great");
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("TS is great");
    });

    it("filters by category", () => {
      store.addMemory("preference", "Dark mode");
      store.addMemory("fact", "Portland");

      expect(store.searchMemories(undefined, "preference")).toHaveLength(1);
    });

    it("respects limit", () => {
      for (let i = 0; i < 10; i++) store.addMemory("fact", `F${i}`);
      expect(store.searchMemories(undefined, undefined, 3)).toHaveLength(3);
    });

    it("removes a memory", () => {
      const id = store.addMemory("fact", "tmp");
      expect(store.removeMemory(id)).toBe(true);
      expect(store.searchMemories("tmp")).toHaveLength(0);
    });

    it("removeMemory returns false for missing id", () => {
      expect(store.removeMemory(9999)).toBe(false);
    });

    it("generates memory summary", () => {
      store.addMemory("preference", "Dark");
      store.addMemory("fact", "PDX");
      const summary = store.getMemorySummary();
      expect(summary).toContain("**preference**");
      expect(summary).toContain("**fact**");
    });
  });

  // ------------------------------------------------------------------
  // Conversation log
  // ------------------------------------------------------------------

  describe("conversationLog", () => {
    it("returns empty for no logs", () => {
      expect(store.getRecentConversation()).toBe("");
    });

    it("logs and retrieves", () => {
      store.logConversation("user", "Hello", "tui");
      store.logConversation("assistant", "Hi!", "tui");
      const recent = store.getRecentConversation(10);
      expect(recent).toContain("Hello");
      expect(recent).toContain("Hi!");
    });
  });

  // ------------------------------------------------------------------
  // Worker sessions
  // ------------------------------------------------------------------

  describe("workerSessions", () => {
    it("saves and deletes", () => {
      store.saveWorkerSession("w1", "s1", "/tmp");
      store.updateWorkerStatus("w1", "running");
      store.deleteWorkerSession("w1");
      // No crash = success (in-memory store doesn't expose query API)
    });
  });

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  it("close is a no-op", () => {
    expect(() => store.close()).not.toThrow();
  });
});
