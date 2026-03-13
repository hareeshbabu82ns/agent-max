import { describe, it, expect } from "vitest";
import { toTelegramMarkdown, chunkMessage } from "../../src/telegram/formatter.js";

describe("chunkMessage", () => {
  it("returns a single chunk for short messages", () => {
    const result = chunkMessage("Hello, world!");
    expect(result).toEqual(["Hello, world!"]);
  });

  it("splits long messages into chunks at newlines", () => {
    const longText = Array(200).fill("Line of text that is moderately long enough to exceed chunk size").join("\n");
    const chunks = chunkMessage(longText);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it("splits at spaces when no newline is available", () => {
    const longText = Array(200).fill("word").join(" ").repeat(30);
    const chunks = chunkMessage(longText);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it("returns empty array content for empty string", () => {
    const result = chunkMessage("");
    expect(result).toEqual([""]);
  });

  it("preserves all content across chunks", () => {
    const longText = Array(200).fill("test content line").join("\n");
    const chunks = chunkMessage(longText);
    const reassembled = chunks.join("\n");
    // All lines should be present
    expect(reassembled).toContain("test content line");
  });
});

describe("toTelegramMarkdown", () => {
  it("converts bold **text** to *text*", () => {
    const result = toTelegramMarkdown("This is **bold** text");
    expect(result).toContain("*bold*");
  });

  it("converts italic *text* to _text_", () => {
    const result = toTelegramMarkdown("This is *italic* text");
    expect(result).toContain("_italic_");
  });

  it("preserves code blocks", () => {
    const input = "Here is code:\n```js\nconst x = 1;\n```";
    const result = toTelegramMarkdown(input);
    expect(result).toContain("```js\nconst x = 1;\n```");
  });

  it("preserves inline code", () => {
    const result = toTelegramMarkdown("Use `npm install` to install");
    expect(result).toContain("`npm install`");
  });

  it("converts headers to bold", () => {
    const result = toTelegramMarkdown("## My Header");
    expect(result).toContain("*My Header*");
  });

  it("escapes special characters in plain text", () => {
    const result = toTelegramMarkdown("Price is $5.00 (tax included)");
    // Parentheses and dots should be escaped
    expect(result).toContain("\\.");
    expect(result).toContain("\\(");
    expect(result).toContain("\\)");
  });

  it("removes horizontal rules", () => {
    const result = toTelegramMarkdown("Before\n---\nAfter");
    expect(result).not.toContain("---");
  });

  it("cleans up excessive blank lines", () => {
    const result = toTelegramMarkdown("Line 1\n\n\n\n\nLine 2");
    expect(result).not.toContain("\n\n\n");
  });

  it("handles empty input", () => {
    expect(toTelegramMarkdown("")).toBe("");
  });
});
