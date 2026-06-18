import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/** A discovered .code-workspace file. */
export interface WorkspaceEntry {
  /** Display name (workspace file name without the .code-workspace extension). */
  name: string;
  /** Absolute path to the .code-workspace file. */
  fsPath: string;
  /** Absolute path of the parent directory, used for display context. */
  parentDir: string;
  /** Optional icon color read from the file's "workspaceSwitcher.iconColor" setting. */
  color?: string;
}

/** Settings key (inside a .code-workspace file) that defines the list icon color. */
const ICON_COLOR_KEY = "workspaceSwitcher.iconColor";

/** Folders that are always skipped during scanning. */
const DEFAULT_IGNORE = new Set<string>([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "bin",
  "obj",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  "vendor",
  "target",
  ".idea",
  ".vscode",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
]);

/**
 * @function expandHome
 * @description Expands a leading "~" in a path to the user's home directory.
 * @param {string} p - Path that may start with "~".
 * @returns {string} The absolute path with "~" expanded.
 */
export function expandHome(p: string): string {
  if (p === "~") {
    return os.homedir();
  }
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * @function shortHome
 * @description Replaces the home directory prefix of a path with "~" for compact display.
 * @param {string} p - Absolute path.
 * @returns {string} The path with the home directory collapsed to "~".
 */
export function shortHome(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

/**
 * @function parseJsonc
 * @description Parses JSON-with-comments (the .code-workspace format): strips // and
 * block comments and trailing commas, then JSON.parse. String contents are preserved,
 * so "//" or commas inside strings (e.g. URLs) are not mangled.
 * @param {string} text - Raw file contents.
 * @returns {unknown} The parsed value.
 */
function parseJsonc(text: string): unknown {
  let out = "";
  let inStr = false;
  let inLine = false;
  let inBlock = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];

    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      out += c;
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }

  // Drop trailing commas before a closing } or ].
  out = out.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(out);
}

/**
 * @function readIconColor
 * @description Reads the "workspaceSwitcher.iconColor" setting from a .code-workspace
 * file. Returns undefined when the file cannot be read/parsed or the key is absent.
 * @param {string} file - Absolute path to a .code-workspace file.
 * @returns {Promise<string | undefined>} The trimmed color string, if present.
 */
async function readIconColor(file: string): Promise<string | undefined> {
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    const data = parseJsonc(raw) as { settings?: Record<string, unknown> };
    const value = data?.settings?.[ICON_COLOR_KEY];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined; // malformed file or read error — no color
  }
}

/**
 * @function scanWorkspaces
 * @description Recursively scans the given root folders for .code-workspace files.
 * Known heavy folders (node_modules, dist, …) and hidden directories are skipped,
 * and symlinked directories are not followed, preventing infinite loops.
 * @param {string[]} rootFolders - Root folders to scan ("~" supported).
 * @param {number} maxDepth - Maximum recursion depth from each root.
 * @param {string[]} ignoreFolders - Extra folder names to skip.
 * @returns {Promise<WorkspaceEntry[]>} Deduplicated, alphabetically sorted entries.
 */
export async function scanWorkspaces(
  rootFolders: string[],
  maxDepth: number,
  ignoreFolders: string[]
): Promise<WorkspaceEntry[]> {
  const ignore = new Set<string>([...DEFAULT_IGNORE, ...ignoreFolders]);
  const results = new Map<string, WorkspaceEntry>();

  async function walk(dir: string, depth: number): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied, missing folder, etc. — skip silently
    }

    // Collect .code-workspace files at this level.
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".code-workspace")) {
        const full = path.join(dir, e.name);
        results.set(full, {
          name: e.name.replace(/\.code-workspace$/, ""),
          fsPath: full,
          parentDir: dir,
          color: await readIconColor(full),
        });
      }
    }

    if (depth >= maxDepth) {
      return;
    }

    for (const e of entries) {
      // isDirectory() is false for symlinks (withFileTypes), so loops are avoided.
      if (!e.isDirectory()) {
        continue;
      }
      if (e.name.startsWith(".")) {
        continue; // skip hidden directories
      }
      if (ignore.has(e.name)) {
        continue;
      }
      await walk(path.join(dir, e.name), depth + 1);
    }
  }

  for (const root of rootFolders) {
    await walk(expandHome(root), 0);
  }

  return [...results.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}
