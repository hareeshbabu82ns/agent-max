import { describe, it, expect } from "vitest";
import { getOrchestratorSystemMessage } from "../../src/copilot/system-message.js";

describe("getOrchestratorSystemMessage", () => {
  it("returns a non-empty string with core identity", () => {
    const msg = getOrchestratorSystemMessage();
    expect(msg).toContain("You are Max");
    expect(msg).toContain("personal AI assistant");
    expect(msg.length).toBeGreaterThan(100);
  });

  it("includes memory block when memorySummary is provided", () => {
    const msg = getOrchestratorSystemMessage("Burke likes coffee");
    expect(msg).toContain("Long-Term Memory");
    expect(msg).toContain("Burke likes coffee");
  });

  it("omits memory block when memorySummary is empty or undefined", () => {
    expect(getOrchestratorSystemMessage(undefined)).not.toContain("Long-Term Memory");
    expect(getOrchestratorSystemMessage("")).not.toContain("Long-Term Memory");
  });

  it("includes self-edit protection by default", () => {
    const msg = getOrchestratorSystemMessage();
    expect(msg).toContain("Self-Edit Protection");
    expect(msg).toContain("NEVER modify your own source code");
  });

  it("omits self-edit protection when selfEditEnabled is true", () => {
    const msg = getOrchestratorSystemMessage(undefined, { selfEditEnabled: true });
    expect(msg).not.toContain("Self-Edit Protection");
  });

  it("includes channel descriptions", () => {
    const msg = getOrchestratorSystemMessage();
    expect(msg).toContain("Telegram");
    expect(msg).toContain("TUI");
    expect(msg).toContain("Background");
  });

  it("includes tool usage instructions", () => {
    const msg = getOrchestratorSystemMessage();
    expect(msg).toContain("create_worker_session");
    expect(msg).toContain("send_to_worker");
    expect(msg).toContain("remember");
    expect(msg).toContain("recall");
  });

  it("includes OS name", () => {
    const msg = getOrchestratorSystemMessage();
    // Should include one of the OS names
    expect(msg).toMatch(/macOS|Windows|Linux/);
  });
});
