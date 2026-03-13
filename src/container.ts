/**
 * Lightweight service container — a typed bag of dependencies.
 *
 * Created once in daemon.ts and threaded through all subsystems so they
 * don't import global singletons directly.  This enables testing (inject
 * InMemoryStore, mock provider, etc.) and keeps coupling explicit.
 */

import type { Store } from "./types/store.js";
import type { ModelProvider } from "./types/provider.js";
import type { AppConfig } from "./types/config.js";
import type { SkillProvider } from "./types/skill.js";
import type { ChannelRegistry } from "./channels/registry.js";

export interface ServiceContainer {
  readonly store: Store;
  readonly config: AppConfig;
  provider: ModelProvider;
  readonly channels: ChannelRegistry;
  readonly skills: SkillProvider;
  readonly persistModel: (model: string) => void;
}
