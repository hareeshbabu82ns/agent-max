# OpenClaw vs Agent-Max: Comprehensive Feature Research Report

**Research Date:** 2026-03-13  
**Target Repository:** [openclaw/openclaw](https://github.com/openclaw/openclaw)  
**Comparison Repository:** `/home/hcoder/dev/agent-max` (agent-max)

---

## Executive Summary

[OpenClaw](https://github.com/openclaw/openclaw) is a production-grade, multi-channel AI gateway and personal assistant (v2026.3.12) with a TypeScript monorepo exceeding 100,000 lines of source code. It supports 10+ messaging channels, 6+ model providers, a 50+ skill library, vector-based memory with embeddings, a cron scheduler, full Agent Client Protocol (ACP) integration for sub-agent spawning, a formal plugin SDK, and companion apps for iOS, macOS, and Android. Agent-Max (`heymax` v1.1.0) is a lean Copilot SDK orchestrator with Telegram + TUI channels, SQLite-backed keyword memory, a basic skill scanner, and a single model provider (GitHub Copilot). The gap between the two codebases is significant — OpenClaw is architecturally 10–15x more complex — but the core orchestrator loop in Max is clean and provides a solid foundation for progressive enhancement. The most impactful improvements to implement in order are: **multiple model providers**, **heartbeat/auth-health monitoring**, **persona support**, **vector memory**, **more channels**, **cron scheduling**, and **a formal skills/plugin registry**.

---

## Architecture Overview

### Agent-Max Current Architecture

```
Telegram ──→ Max Daemon ←── TUI (HTTP/SSE)
                 │
           Orchestrator Session (Copilot SDK)
           ┌─────────────────────────────┐
           │  tools.ts (7 tools)         │
           │  system-message.ts          │
           │  mcp-config.ts              │
           │  skills.ts (SKILL.md scan)  │
           └─────────────────────────────┘
                 │
       ┌─────────┼─────────┐
    Worker 1  Worker 2  Worker N (max 5)
    (Copilot SDK sessions in specific dirs)

Storage: SQLite (better-sqlite3)
  - worker_sessions
  - max_state
  - conversation_log
  - memories
```

### OpenClaw Architecture

```
Telegram ──┐
Slack   ──┤                   ┌──────────────────────┐
Discord ──┤                   │   Gateway / ACP      │
WhatsApp──┤──→  Channel       │   Control Plane      │
Signal  ──┤     Registry  ──→ │   Auth Profiles      │
LINE    ──┤     (routing.ts)  │   Session Manager    │
iMessage──┤                   │   Security Guardrails│
Web     ──┘                   └──────────────────────┘
                                          │
              ┌─────────────────────────────────────────┐
              │           Provider Layer                │
              │  OpenAI · Anthropic · Google · Bedrock  │
              │  GitHub Copilot · Kilocode · Qwen       │
              └─────────────────────────────────────────┘
                                          │
         ┌────────────────────────────────┼───────────────┐
     ACP Agents    Skills (50+)      Memory          Cron Jobs
   (sub-agents)  (ClawHub registry)  (vector +      (croner)
                                      SQLite +
                                      embeddings)

Companion Apps: macOS · iOS · Android
Plugin SDK: @openclaw/plugin-sdk
```

---

## Feature-by-Feature Comparison

### 1. Channels / Input Sources

| Feature | Agent-Max | OpenClaw |
|---------|-----------|----------|
| Telegram | ✅ (grammy) | ✅ (grammy + runner + throttler) |
| Terminal TUI | ✅ (HTTP/SSE) | ✅ (full TUI with progress lines) |
| Slack | ❌ | ✅ (@slack/bolt + @slack/web-api) |
| Discord | ❌ | ✅ (@buape/carbon, discord-api-types) |
| WhatsApp | ❌ | ✅ (@whiskeysockets/baileys) |
| Signal | ❌ | ✅ (src/signal/) |
| iMessage/BlueBubbles | ❌ | ✅ (src/imessage/, skills/bluebubbles) |
| LINE | ❌ | ✅ (@line/bot-sdk, src/line/) |
| Lark/Feishu | ❌ | ✅ (@larksuiteoapi/node-sdk) |
| Web (browser) | ❌ | ✅ (src/web/, Hono, Lit-based UI) |
| Discord voice | ❌ | ✅ (@discordjs/voice, extensions/voice-call) |

Agent-Max provides 2 channels; OpenClaw provides 10+.[^1][^2]

---

### 2. Model Providers

| Provider | Agent-Max | OpenClaw |
|----------|-----------|----------|
| GitHub Copilot | ✅ (sole provider) | ✅ (src/providers/github-copilot-auth.ts) |
| OpenAI | ❌ | ✅ (batch-openai.ts, embeddings-openai.ts) |
| Anthropic | ❌ | ✅ (src/agents/anthropic*.ts) |
| Google Gemini | ❌ | ✅ (src/providers/google-shared.ts, embeddings-gemini.ts) |
| AWS Bedrock | ❌ | ✅ (@aws-sdk/client-bedrock) |
| Kilocode | ❌ | ✅ (src/providers/kilocode-shared.ts) |
| Qwen | ❌ | ✅ (src/providers/qwen-portal-oauth.ts) |
| Ollama (local) | ❌ | ✅ (embeddings-ollama.ts) |
| Mistral | ❌ | ✅ (embeddings-mistral.ts) |

Agent-Max is hardwired to `@github/copilot-sdk`.[^3] OpenClaw uses `auth-profiles.ts` with a provider-keyed credential store supporting OAuth, API keys, and token credentials per-provider.[^4]

OpenClaw's model selection is per-session and per-channel via `src/sessions/model-overrides.ts`[^5] and `src/channels/model-overrides.ts`.[^6]

**What to implement in Max:** Abstract the model layer behind an interface. Add a `providers/` directory with adapters for each provider, keyed off a `PROVIDER` env var or config field. OpenClaw's `auth-profiles.ts` structure is a good template for credential storage.

---

### 3. Heartbeat / Health Monitoring

| Feature | Agent-Max | OpenClaw |
|---------|-----------|----------|
| Basic interval health check | ✅ 30s timer in orchestrator.ts | ✅ |
| Auth credential expiry tracking | ❌ | ✅ |
| Per-profile cooldown / circuit-breaker | ❌ | ✅ |
| Auth health REST endpoint | ❌ | ✅ |
| Provider-level rollup status | ❌ | ✅ |
| Token expiry warnings | ❌ | ✅ |

**Agent-Max heartbeat:** A 30-second `setInterval` in `src/copilot/orchestrator.ts:116–132` checks `copilotClient.getState()` and resets the connection if not `"connected"`.[^7]

**OpenClaw auth-health:** `src/agents/auth-health.ts` exports `buildAuthHealthSummary()` which computes per-profile health (`ok | expiring | expired | missing | static`) and per-provider rollup. It tracks `remainingMs`, `expiresAt`, `warnAfterMs` (default 24h), and handles OAuth refresh token semantics (if a refresh token exists, expiring access token does not trigger a warning).[^8]

`src/agents/auth-profiles/usage.ts` exports `markAuthProfileCooldown()`, `clearAuthProfileCooldown()`, `markAuthProfileFailure()`, and `getSoonestCooldownExpiry()` — a full circuit-breaker pattern for individual auth profiles.[^9]

**What to implement in Max:**
- Expose a `/health` endpoint on the existing HTTP API
- Extend the 30s health check to report Copilot token expiry state
- Add a cooldown registry to handle provider 429/auth errors gracefully

---

### 4. Agents / Sub-Agent Spawning

| Feature | Agent-Max | OpenClaw |
|---------|-----------|----------|
| Worker sessions (Copilot SDK) | ✅ up to 5 | ✅ |
| Agent Client Protocol (ACP) | ❌ | ✅ (@agentclientprotocol/sdk) |
| ACP spawn with streaming | ❌ | ✅ (src/agents/acp-spawn.ts) |
| ACP parent-child stream pipe | ❌ | ✅ (src/agents/acp-spawn-parent-stream.ts) |
| ACP control plane / manager | ❌ | ✅ (src/acp/control-plane/) |
| ACP policy enforcement | ❌ | ✅ (src/acp/policy.js) |
| Agent scopes / ownership | ❌ | ✅ (src/agents/agent-scope.ts) |
| Background result feed-back | ✅ (feedBackgroundResult) | ✅ |
| Multiple concurrent orchestrators | ❌ | ✅ |

Agent-Max implements worker sessions as direct Copilot SDK sessions in a specific `working_dir`, managed in an in-memory `Map<string, WorkerInfo>`, persisted to SQLite, with a `MAX_CONCURRENT_WORKERS = 5` limit.[^10]

OpenClaw uses the [Agent Client Protocol SDK](https://www.npmjs.com/package/@agentclientprotocol/sdk) (`@agentclientprotocol/sdk` v0.16.1) for structured agent spawning with streaming, parent-child stream piping, and a control-plane manager. `src/agents/acp-spawn.ts` manages lifecycle, `src/agents/agent-scope.ts` defines ownership semantics, and `src/acp/policy.js` enforces per-agent capability policies.[^11]

Also notable: OpenClaw has `@mariozechner/pi-agent-core`, `pi-coding-agent`, and `pi-tui` packages (Mario Zechner's "pi" ecosystem), suggesting it supports a second class of local coding agents alongside ACP.[^12]

**What to implement in Max:** The existing `WorkerInfo` pattern is already a light ACP. Key upgrades: (1) add `agent-scope.ts` to track ownership of spawned agents; (2) stream partial results back to the parent session as they arrive rather than only on completion.

---

### 5. Personas

**Agent-Max:** No persona system. The `system-message.ts` file bakes in a static "Max" identity injected as the system prompt.[^13]

**OpenClaw:** No dedicated `persona.ts` was found (the path does not exist), but persona-adjacent features exist:
- `src/channels/sender-identity.ts` — resolves how the sender is identified per channel
- `src/channels/reply-prefix.ts` — per-channel prefixing on replies (e.g., bot name)
- `src/channels/channel-config.ts` — per-channel config including display identity
- Each channel's `registry.ts` can override the bot name and behavior

The VISION.md explicitly states OpenClaw is "the AI that actually does things" and runs "with your rules" — implying per-deployment persona is configurable through config rather than a runtime persona selection API.[^14]

**What to implement in Max:**
1. Extract the system prompt into a configurable `persona.json` / `~/.max/persona.md`
2. Support multiple named personas loadable from `~/.max/personas/` directory
3. Allow switching persona via `/persona [name]` TUI command
4. Per-channel persona overrides (e.g., Telegram gets "Max", TUI gets "Dev-Max")

---

### 6. Skills

| Feature | Agent-Max | OpenClaw |
|---------|-----------|----------|
| Bundled skills | 2 (find-skills, gogcli) | 50+ (1password, apple-notes, github, etc.) |
| SKILL.md frontmatter format | ✅ | ✅ (same pattern) |
| Local skills dir | ✅ (~/.max/skills/) | ✅ |
| Global skills dir | ✅ (~/.agents/skills/) | ✅ |
| Online skill registry | ❌ | ✅ (ClawHub — clawhub.ai) |
| Skill creator tool | ✅ (createSkill() in tools.ts) | ✅ (skills/skill-creator/) |
| Skill remove tool | ✅ (removeSkill()) | ❌ (not in core) |

**Notable OpenClaw skills:**

| Skill | Description |
|-------|-------------|
| `coding-agent` | Full coding agent harness (pi-coding-agent integration) |
| `github` | GitHub issues, PRs, repo operations |
| `gh-issues` | GitHub issues workflow |
| `canvas` | Canvas drawing/generation |
| `voice-call` | Discord voice call integration |
| `mcporter` | MCP server bridge (mcporter package) |
| `tmux` | Terminal multiplexer control |
| `model-usage` | Model usage tracking |
| `clawhub` | ClawHub skill marketplace |
| `oracle` | AI-powered document Q&A |
| `spotify-player` | Spotify control |
| `session-logs` | Access session history |
| `weather` | Weather lookup |

**Max's skill format is compatible with OpenClaw's** — both use `SKILL.md` with YAML frontmatter (`name`, `description`) and a markdown body containing instructions. Any OpenClaw skill that doesn't depend on OpenClaw-specific APIs can be used directly in Max.[^15][^16]

**What to implement in Max:** Add a `clawhub://` skill install flow — given a package name, `npm install` or clone it to `~/.max/skills/`. Expand bundled skill set (github, weather, tmux are high-value and straightforward).

---

### 7. Memory

| Feature | Agent-Max | OpenClaw |
|---------|-----------|----------|
| SQLite storage | ✅ | ✅ |
| Keyword search | ✅ | ✅ |
| Vector embeddings | ❌ | ✅ |
| Semantic search | ❌ | ✅ (src/memory/manager.ts) |
| sqlite-vec integration | ❌ | ✅ (sqlite-vec 0.1.7-alpha.2) |
| Embedding providers | ❌ | ✅ (OpenAI, Gemini, Mistral, Ollama, Voyage) |
| MMR (Max Marginal Relevance) | ❌ | ✅ (src/memory/mmr.ts) |
| Temporal decay | ❌ | ✅ (src/memory/temporal-decay.ts) |
| Remote memory server | ❌ | ✅ (src/memory/remote-http.ts) |
| Memory batching | ❌ | ✅ (src/memory/batch-runner.ts) |
| File-based memory sync | ❌ | ✅ (src/memory/session-files.ts) |
| One active memory plugin | ❌ | ✅ (plugin slot architecture) |

Agent-Max stores memories in SQLite with 5 categories and keyword-only `LIKE` search.[^17] OpenClaw has a full vector memory stack: embedding generation → sqlite-vec storage → MMR-ranked semantic search → temporal decay scoring → remote/local backends.[^18]

**What to implement in Max (incremental path):**
1. **Short-term:** Add BM25 full-text search to `memories` table (`fts5` SQLite extension)
2. **Medium-term:** Integrate `sqlite-vec` for local vector embeddings using an Ollama or OpenAI embedding endpoint
3. **Long-term:** Adopt OpenClaw's MMR + temporal decay scoring

---

### 8. Cron / Scheduled Tasks

**Agent-Max:** No cron support. All interactions are reactive (user sends message → response).

**OpenClaw:** `src/cron/` with `croner` (v10.0.1) integration. Files include:
- `cron-protocol-conformance.test.ts` — protocol tests
- Full cron job management, scheduling, and execution

The cron system allows OpenClaw to run scheduled tasks (e.g., daily summaries, periodic checks, reminders) without user prompting.[^19]

**What to implement in Max:** Add a `~/.max/cron.json` config file with cron expressions and prompt templates. Use `node-cron` or `croner` to trigger `sendToOrchestrator()` calls on schedule.

---

### 9. Plugin SDK

**Agent-Max:** No formal plugin SDK. Extensions are limited to MCP servers (configured via `mcp-config.ts`) and skill directories.

**OpenClaw:** Ships `@openclaw/plugin-sdk` (built from `tsconfig.plugin-sdk.dts.json`, `tsdown.config.ts`). Key plugin capabilities:
- Register HTTP handlers (`src/scripts/check-no-register-http-handler.mjs` enforces this)
- Extend channel behavior
- Inject context into sessions
- Memory backend plugins (one active at a time)
- Voice call plugin (`extensions/voice-call/`)
- MCP bridge via `mcporter` (external npm package)

Plugin loading: `src/plugins/` contains plugin registration; `src/extensionAPI.ts` exports the plugin surface.[^20]

**What to implement in Max:** A minimal plugin interface — a JS file that exports `{ name, setup(ctx) }` loaded from `~/.max/plugins/`. `ctx` exposes `addTool()`, `addMemoryProvider()`, `onMessage()`. This enables extensions without core changes.

---

### 10. Security

| Feature | Agent-Max | OpenClaw |
|---------|-----------|----------|
| Telegram user ID allowlist | ✅ (authorizedUserId) | ✅ |
| Worker directory blocklist | ✅ (.ssh, .aws, etc.) | ✅ |
| TUI (no auth needed, local only) | ✅ | ✅ |
| Per-channel allowlists | ❌ | ✅ (src/channels/allowlists/) |
| Command gating | ❌ | ✅ (src/channels/command-gating.ts) |
| Mention gating | ❌ | ✅ (src/channels/mention-gating.ts) |
| Pairing / account scope | ❌ | ✅ (src/pairing/, lint rules enforcing scope) |
| Sandbox Docker exec | ❌ | ✅ (Dockerfile.sandbox-*) |
| Host environment policy (Swift) | ❌ | ✅ (scripts/generate-host-env-security-policy-swift.mjs) |
| Secrets scanning baseline | ❌ | ✅ (.secrets.baseline, detect-secrets) |
| Self-edit mode (explicit flag) | ✅ (--self-edit flag) | ❌ |

**What to implement in Max:** Add `per-channel allowlist` support and `command gating` (block specific slash commands per channel). The sandbox Docker approach is valuable for safe code execution.

---

### 11. Gateway / Transport

**Agent-Max:** HTTP API for TUI using Express (`src/api/server.ts`) with SSE for streaming. Simple REST endpoints.

**OpenClaw:** `src/gateway/` (164KB of files) implements a full WebSocket/reconnect gateway with:
- Protocol schema generation (`scripts/protocol-gen.ts`)
- Auth compat baseline
- Reconnect gating
- Error detail propagation
- Client + server halves (src/gateway/client.test.ts, server.test.ts)
- Hono (v4.12.7) for HTTP routing — faster than Express[^21]

**What to implement in Max:** Migrate from Express to Hono (drop-in, faster), and add WebSocket support alongside SSE for more reliable TUI streaming.

---

### 12. Context Engine / Link Understanding

**Agent-Max:** No URL/link processing. Relies on model's training.

**OpenClaw:** `src/context-engine/` and `src/link-understanding/` provide:
- `@mozilla/readability` — extract readable content from web pages
- `playwright-core` — headless browser for dynamic pages
- `pdfjs-dist` — PDF text extraction
- Media understanding (`src/media-understanding/`)
- Image processing with `sharp`

**What to implement in Max:** Add a `fetch_url` tool using `@mozilla/readability` + `linkedom` (lighter than playwright) for web page summarization. This dramatically expands Max's ability to research and act on URLs.

---

### 13. TUI (Terminal User Interface)

**Agent-Max:** Basic TUI via HTTP/SSE client (`src/tui/index.ts`), markdown rendered via `marked`.

**OpenClaw:** Full TUI powered by `@mariozechner/pi-tui` with:
- Progress line rendering (`src/terminal/progress-line.ts`)
- Terminal state restoration (`src/terminal/restore.ts`)
- Highlight.js code highlighting (`cli-highlight`)
- QR code display (`qrcode-terminal`)
- Markdown rendering (`markdown-it`)
- `@clack/prompts` for interactive setup wizard

**What to implement in Max:** Add `cli-highlight` for code blocks in TUI output, and `qrcode-terminal` for QR-based mobile pairing/setup.

---

### 14. i18n / Internationalization

**Agent-Max:** None.

**OpenClaw:** `src/i18n/` directory with internationalization support. VISION.md defers full translation sets but infrastructure exists.

---

### 15. Companion Apps

**Agent-Max:** Terminal only.

**OpenClaw:** iOS app (Swift/Xcode), macOS app, Android app (Kotlin/Gradle). Uses `@homebridge/ciao` for mDNS discovery, `src/pairing/` for QR-based pairing, and a shared `OpenClawKit` Swift package.

---

## Recommended Implementation Roadmap for Agent-Max

Prioritized by impact-to-effort ratio:

### Phase 1 — High Impact, Low Effort

1. **Multiple model providers** — Add `src/providers/` with OpenAI, Anthropic, and Ollama adapters. Store provider + API key in `~/.max/.env`. Default to Copilot SDK if no provider configured.
   - Key files to adapt: `src/copilot/client.ts`, `src/config.ts`
   - Dependency: add `openai` and `@anthropic-ai/sdk` packages

2. **Enhanced heartbeat/health** — Extend the 30s health check interval to track token expiry state and report via `/health` HTTP endpoint. Add a cooldown map for provider errors.
   - Key file: `src/copilot/orchestrator.ts:116-132`[^7]

3. **Persona system** — Extract system message into `~/.max/persona.md`. Support named personas in `~/.max/personas/`. Add `/persona` TUI command.
   - Key file: `src/copilot/system-message.ts`

4. **URL/fetch tool** — Add `fetch_url` tool using `@mozilla/readability` + `linkedom`. Minimal dependency, very high utility.
   - Key file: `src/copilot/tools.ts`

5. **Cron scheduling** — Add `~/.max/cron.json` support using `croner` package. Inject scheduled prompts into orchestrator.
   - Key file: `src/daemon.ts`

### Phase 2 — Medium Impact, Medium Effort

6. **Skill registry / ClawHub** — Add `max skill install <name>` command that npm-installs skill packages to `~/.max/skills/`.

7. **Vector memory** — Add `sqlite-vec` to SQLite, integrate one embedding provider (Ollama default for local). Keep keyword search as fallback.

8. **Slack channel** — Add `@slack/bolt` channel alongside Telegram. Socket mode for simplicity.

9. **Plugin interface** — Simple `~/.max/plugins/*.js` loader exposing `addTool()`, `onMessage()`.

### Phase 3 — Higher Effort, Strategic Value

10. **Migrate gateway to Hono + WebSockets** — Replace Express SSE with Hono + WebSocket for TUI.

11. **Sandbox Docker execution** — Wrap worker sessions in Docker containers for isolation.

12. **Discord channel** — Add Discord bot support.

13. **Companion macOS app** — QR-based pairing, system tray presence.

---

## Key Repositories Summary

| Repository | Purpose | Key Files |
|------------|---------|-----------|
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | Full AI gateway | `src/`, `skills/`, `extensions/`, `apps/` |
| [hareeshbabu82ns/agent-max](https://github.com/hareeshbabu82ns/agent-max) (agent-max) | Copilot orchestrator | `src/copilot/`, `src/telegram/`, `src/tui/` |

---

## Confidence Assessment

| Finding | Confidence | Notes |
|---------|------------|-------|
| Channel list | High | Verified from package.json deps and src/ directory |
| Provider list | High | Verified from src/providers/ file names and imports |
| Heartbeat implementation | High | Read actual source code from both repos |
| Skills format compatibility | High | Both use identical SKILL.md frontmatter format |
| ACP integration | High | Verified @agentclientprotocol/sdk in package.json and src/agents/acp-spawn.ts |
| Persona system in OpenClaw | Medium | No `persona.ts` found; inferred from channel-config and sender-identity |
| ClawHub skill count | Medium | Counted 50 dirs in `skills/`; actual active count may differ |
| Cron implementation details | Medium | Verified croner dep and src/cron/ dir; didn't read cron source files |
| Plugin SDK surface | Medium | Verified extensionAPI.ts and plugin-sdk build; didn't read full plugin API |
| Memory MMR/vector scoring | High | Read src/memory/ file list including mmr.ts, temporal-decay.ts, sqlite-vec.ts |

---

## Footnotes

[^1]: Agent-Max channels — `src/daemon.ts:54–66`, `src/telegram/bot.ts`, `src/api/server.ts`
[^2]: OpenClaw channels — `package.json` deps: `grammy`, `@slack/bolt`, `@buape/carbon`, `@whiskeysockets/baileys`, `@line/bot-sdk`, `@larksuiteoapi/node-sdk`; dirs: `src/telegram/`, `src/slack/`, `src/discord/`, `src/whatsapp/`, `src/signal/`, `src/imessage/`, `src/line/`
[^3]: Agent-Max model config — `src/config.ts` (single `COPILOT_MODEL` env var), `src/copilot/client.ts` (`@github/copilot-sdk`)
[^4]: OpenClaw auth profiles — `src/agents/auth-profiles.ts` (barrel exports for credential store, OAuth/token/api_key credential types, per-provider profiles)
[^5]: OpenClaw session model overrides — `src/sessions/model-overrides.ts`
[^6]: OpenClaw channel model overrides — `src/channels/model-overrides.ts`
[^7]: Agent-Max health check — `src/copilot/orchestrator.ts:115–132` (`HEALTH_CHECK_INTERVAL_MS = 30_000`, checks `copilotClient.getState()`)
[^8]: OpenClaw auth health — `src/agents/auth-health.ts`, `buildAuthHealthSummary()`, `DEFAULT_OAUTH_WARN_MS = 24 * 60 * 60 * 1000`
[^9]: OpenClaw auth cooldown — `src/agents/auth-profiles/usage.ts` (`markAuthProfileCooldown`, `markAuthProfileFailure`, `getSoonestCooldownExpiry`)
[^10]: Agent-Max workers — `src/copilot/tools.ts:28–100` (`MAX_CONCURRENT_WORKERS = 5`, `BLOCKED_WORKER_DIRS`, `WorkerInfo` interface)
[^11]: OpenClaw ACP — `src/agents/acp-spawn.ts`, `src/agents/acp-spawn-parent-stream.ts`, `src/agents/agent-scope.ts`, `src/acp/control-plane/`; package: `@agentclientprotocol/sdk 0.16.1`
[^12]: OpenClaw pi-agent — `package.json` deps: `@mariozechner/pi-agent-core 0.57.1`, `@mariozechner/pi-coding-agent 0.57.1`, `@mariozechner/pi-tui 0.57.1`
[^13]: Agent-Max system message — `src/copilot/system-message.ts` (static "Max" identity)
[^14]: OpenClaw vision — `VISION.md` ("runs on your devices, in your channels, with your rules")
[^15]: Agent-Max skills format — `src/copilot/skills.ts:60–80` (SKILL.md frontmatter: `name`, `description`)
[^16]: OpenClaw skills list — `skills/` directory (50 subdirectories: 1password, apple-notes, github, tmux, weather, etc.)
[^17]: Agent-Max memory — `src/store/db.ts:126–171` (5 categories, `LIKE` keyword search)
[^18]: OpenClaw memory — `src/memory/` directory (manager.ts, mmr.ts, temporal-decay.ts, sqlite-vec.ts, embeddings-*.ts, batch-*.ts, remote-http.ts)
[^19]: OpenClaw cron — `src/cron/` directory; `package.json` dep: `croner ^10.0.1`
[^20]: OpenClaw plugin system — `src/extensionAPI.ts`, `src/plugins/`, `src/plugin-sdk/`, build target `tsconfig.plugin-sdk.dts.json`
[^21]: OpenClaw gateway — `src/gateway/` (164KB); `package.json` dep: `hono 4.12.7`
