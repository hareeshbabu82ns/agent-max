/**
 * Skill management interface.
 *
 * Abstracts how skills are discovered, loaded, created, and removed so that
 * alternative sources (HTTP registry, GitHub, npm, etc.) can be added later.
 */

export interface SkillInfo {
  slug: string;
  name: string;
  description: string;
  directory: string;
  source: "bundled" | "local" | "global";
}

export interface SkillProvider {
  /** Return filesystem paths of all skill directories (for the Copilot SDK). */
  getSkillDirectories(): string[];

  /** List metadata for every discovered skill. */
  listSkills(): SkillInfo[];

  /** Create a new skill in the local skills directory. */
  createSkill(
    slug: string,
    name: string,
    description: string,
    instructions: string,
  ): string;

  /** Remove a local skill by slug. */
  removeSkill(slug: string): { ok: boolean; message: string };
}
