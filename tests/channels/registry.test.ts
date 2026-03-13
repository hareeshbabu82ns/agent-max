import { describe, it, expect } from "vitest";
import { ChannelRegistry } from "../../src/channels/registry.js";
import type { Channel, MessageHandler } from "../../src/types/channel.js";

/** Minimal test double for Channel. */
function createMockChannel(
  id: string,
  name: string,
): Channel & { messages: string[]; started: boolean; stopped: boolean; handler?: MessageHandler } {
  const mock: Channel & {
    messages: string[];
    started: boolean;
    stopped: boolean;
    handler?: MessageHandler;
  } = {
    id,
    name,
    messages: [],
    started: false,
    stopped: false,
    handler: undefined,
    onMessage(handler: MessageHandler) {
      mock.handler = handler;
    },
    async start() {
      mock.started = true;
    },
    async stop() {
      mock.stopped = true;
    },
    async sendMessage(text: string) {
      mock.messages.push(text);
    },
  };
  return mock;
}

describe("ChannelRegistry", () => {
  it("registers and retrieves channels", () => {
    const registry = new ChannelRegistry();
    const ch = createMockChannel("test", "Test");
    registry.register(ch);
    expect(registry.get("test")).toBe(ch);
  });

  it("throws on duplicate registration", () => {
    const registry = new ChannelRegistry();
    registry.register(createMockChannel("test", "Test"));
    expect(() =>
      registry.register(createMockChannel("test", "Test2")),
    ).toThrow("already registered");
  });

  it("returns undefined for unregistered id", () => {
    const registry = new ChannelRegistry();
    expect(registry.get("nope")).toBeUndefined();
  });

  it("lists all channels", () => {
    const registry = new ChannelRegistry();
    registry.register(createMockChannel("a", "A"));
    registry.register(createMockChannel("b", "B"));
    expect(registry.all()).toHaveLength(2);
  });

  it("wires message handler to all channels", () => {
    const registry = new ChannelRegistry();
    const ch1 = createMockChannel("a", "A");
    const ch2 = createMockChannel("b", "B");
    registry.register(ch1);
    registry.register(ch2);

    const handler: MessageHandler = () => {};
    registry.onMessage(handler);
    expect(ch1.handler).toBe(handler);
    expect(ch2.handler).toBe(handler);
  });

  it("startAll starts all channels", async () => {
    const registry = new ChannelRegistry();
    const ch1 = createMockChannel("a", "A");
    const ch2 = createMockChannel("b", "B");
    registry.register(ch1);
    registry.register(ch2);

    await registry.startAll();
    expect(ch1.started).toBe(true);
    expect(ch2.started).toBe(true);
  });

  it("stopAll stops all channels", async () => {
    const registry = new ChannelRegistry();
    const ch = createMockChannel("a", "A");
    registry.register(ch);

    await registry.stopAll();
    expect(ch.stopped).toBe(true);
  });

  it("broadcast sends to specific channel", async () => {
    const registry = new ChannelRegistry();
    const ch1 = createMockChannel("a", "A");
    const ch2 = createMockChannel("b", "B");
    registry.register(ch1);
    registry.register(ch2);

    await registry.broadcast("hello", "a");
    expect(ch1.messages).toEqual(["hello"]);
    expect(ch2.messages).toEqual([]);
  });

  it("broadcast sends to all channels when no id specified", async () => {
    const registry = new ChannelRegistry();
    const ch1 = createMockChannel("a", "A");
    const ch2 = createMockChannel("b", "B");
    registry.register(ch1);
    registry.register(ch2);

    await registry.broadcast("hi");
    expect(ch1.messages).toEqual(["hi"]);
    expect(ch2.messages).toEqual(["hi"]);
  });
});
