import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "fs";
import { basename, dirname, isAbsolute, join, resolve } from "path";
import { parseFrontmatter } from "./frontmatter.js";

/** Max name length per Agent Skills spec */
const MAX_NAME_LENGTH = 64;

/** Max description length per Agent Skills spec */
const MAX_DESCRIPTION_LENGTH = 1024;

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  [key: string]: unknown;
}

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  disableModelInvocation: boolean;
}

/**
 * Validate skill name per Agent Skills spec.
 */
function validateName(name: string, parentDirName: string): string[] {
  const errors: string[] = [];

  if (name !== parentDirName) {
    errors.push(`name "${name}" does not match parent directory "${parentDirName}"`);
  }
  if (name.length > MAX_NAME_LENGTH) {
    errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push(`name must not start or end with a hyphen`);
  }
  if (name.includes("--")) {
    errors.push(`name must not contain consecutive hyphens`);
  }

  return errors;
}

/**
 * Validate description per Agent Skills spec.
 */
function validateDescription(description: string | undefined): string[] {
  const errors: string[] = [];

  if (!description || description.trim() === "") {
    errors.push("description is required");
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
  }

  return errors;
}

/**
 * Load a single skill from a SKILL.md file.
 */
function loadSkillFromFile(
  filePath: string,
  source: string,
): { skill: Skill | null; warnings: string[] } {
  const warnings: string[] = [];

  try {
    const rawContent = readFileSync(filePath, "utf-8");
    const { frontmatter } = parseFrontmatter<SkillFrontmatter>(rawContent);
    const skillDir = dirname(filePath);
    const parentDirName = basename(skillDir);

    // Validate description
    const descErrors = validateDescription(frontmatter.description);
    for (const error of descErrors) {
      warnings.push(`${filePath}: ${error}`);
    }

    // Use name from frontmatter, or fall back to parent directory name
    const name = frontmatter.name || parentDirName;

    // Validate name
    const nameErrors = validateName(name, parentDirName);
    for (const error of nameErrors) {
      warnings.push(`${filePath}: ${error}`);
    }

    // Skills with missing description are not loaded
    if (!frontmatter.description || frontmatter.description.trim() === "") {
      return { skill: null, warnings };
    }

    return {
      skill: {
        name,
        description: frontmatter.description,
        filePath,
        baseDir: skillDir,
        source,
        disableModelInvocation: frontmatter["disable-model-invocation"] === true,
      },
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to parse skill file";
    warnings.push(`${filePath}: ${message}`);
    return { skill: null, warnings };
  }
}

/**
 * Load skills from a directory.
 *
 * Discovery rules:
 * - Direct .md children in the root directory
 * - Recursive SKILL.md under subdirectories
 */
export function loadSkillsFromDir(dir: string, source: string): { skills: Skill[]; warnings: string[] } {
  return loadSkillsFromDirInternal(dir, source, true);
}

function loadSkillsFromDirInternal(
  dir: string,
  source: string,
  includeRootFiles: boolean,
): { skills: Skill[]; warnings: string[] } {
  const skills: Skill[] = [];
  const warnings: string[] = [];

  if (!existsSync(dir)) {
    return { skills, warnings };
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const fullPath = join(dir, entry.name);

      // For symlinks, resolve to check if directory or file
      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const stats = statSync(fullPath);
          isDirectory = stats.isDirectory();
          isFile = stats.isFile();
        } catch {
          continue; // Broken symlink
        }
      }

      if (isDirectory) {
        const subResult = loadSkillsFromDirInternal(fullPath, source, false);
        skills.push(...subResult.skills);
        warnings.push(...subResult.warnings);
        continue;
      }

      if (!isFile) continue;

      const isRootMd = includeRootFiles && entry.name.endsWith(".md");
      const isSkillMd = !includeRootFiles && entry.name === "SKILL.md";
      if (!isRootMd && !isSkillMd) continue;

      const result = loadSkillFromFile(fullPath, source);
      if (result.skill) {
        skills.push(result.skill);
      }
      warnings.push(...result.warnings);
    }
  } catch {
    // Directory read error, skip silently
  }

  return { skills, warnings };
}

/**
 * Format skills for inclusion in a system prompt.
 * Uses XML format per Agent Skills standard.
 * See: https://agentskills.io/integrate-skills
 *
 * Skills with disableModelInvocation=true are excluded.
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  const visibleSkills = skills.filter((s) => !s.disableModelInvocation);

  if (visibleSkills.length === 0) {
    return "";
  }

  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read_file tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];

  for (const skill of visibleSkills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface LoadSkillsOptions {
  /** Explicit skill directories to scan */
  skillDirs?: string[];
  /** Working directory for resolving relative paths. Default: process.cwd() */
  cwd?: string;
}

/**
 * Load skills from all configured directories.
 * Returns deduplicated skills (first-wins on name collision).
 */
export function loadSkills(options: LoadSkillsOptions = {}): { skills: Skill[]; warnings: string[] } {
  const { skillDirs = [], cwd = process.cwd() } = options;

  const skillMap = new Map<string, Skill>();
  const realPathSet = new Set<string>();
  const allWarnings: string[] = [];

  function addSkills(result: { skills: Skill[]; warnings: string[] }) {
    allWarnings.push(...result.warnings);
    for (const skill of result.skills) {
      // Resolve symlinks to detect duplicate files
      let realPath: string;
      try {
        realPath = realpathSync(skill.filePath);
      } catch {
        realPath = skill.filePath;
      }

      // Skip if already loaded this exact file
      if (realPathSet.has(realPath)) continue;

      const existing = skillMap.get(skill.name);
      if (existing) {
        allWarnings.push(
          `Skill name collision: "${skill.name}" from ${skill.filePath} conflicts with ${existing.filePath} (keeping first)`,
        );
      } else {
        skillMap.set(skill.name, skill);
        realPathSet.add(realPath);
      }
    }
  }

  for (const rawDir of skillDirs) {
    const resolvedDir = isAbsolute(rawDir) ? rawDir : resolve(cwd, rawDir);
    if (!existsSync(resolvedDir)) {
      allWarnings.push(`Skill directory does not exist: ${resolvedDir}`);
      continue;
    }
    addSkills(loadSkillsFromDir(resolvedDir, "config"));
  }

  return {
    skills: Array.from(skillMap.values()),
    warnings: allWarnings,
  };
}
