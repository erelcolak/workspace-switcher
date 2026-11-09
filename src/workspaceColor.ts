import * as fs from "fs";
import {
  applyEdits,
  createScanner,
  Edit,
  findNodeAtLocation,
  getNodeValue,
  JSONPath,
  modify,
  Node,
  parseTree,
  ParseError,
  SyntaxKind,
} from "jsonc-parser";
import { isHexColor } from "./colorIcon";

/** Settings key (inside a .code-workspace file) holding the list icon color. */
const ICON_COLOR_KEY = "workspaceSwitcher.iconColor";
/** Settings key holding the workbench color overrides. */
const CUSTOMIZATIONS_KEY = "workbench.colorCustomizations";

/** Workbench color ids this extension writes inside workbench.colorCustomizations. */
export const STATUS_BAR_BACKGROUND = "statusBar.background";
export const STATUS_BAR_FOREGROUND = "statusBar.foreground";
export const ACTIVITY_BAR_BORDER = "activityBar.activeBorder";
const MANAGED_COLOR_KEYS = [
  STATUS_BAR_BACKGROUND,
  STATUS_BAR_FOREGROUND,
  ACTIVITY_BAR_BORDER,
];

/** A theme-scoped block ("[Theme Name]") that sets some of the managed colors. */
export interface ThemeOverride {
  /** The block key, e.g. "[Default Dark Modern]". */
  scope: string;
  /** Managed color ids the block sets. */
  keys: string[];
}

/** The color-related settings currently stored in a .code-workspace file. */
export interface WorkspaceColors {
  iconColor?: string;
  statusBarBackground?: string;
  statusBarForeground?: string;
  activityBarBorder?: string;
  /** "workbench.colorTheme" when the workspace pins its own theme. */
  colorTheme?: string;
  /** Theme-scoped blocks in the file that outrank the general color values. */
  themeOverrides: ThemeOverride[];
}

/** The colors picked by the user and where they should be applied. */
export interface ColorChoice {
  /** Icon color; also status bar background and activity bar border when enabled. */
  background: string;
  /** Status bar foreground (used only when statusBar is true). */
  foreground: string;
  /** Write statusBar.background + statusBar.foreground. */
  statusBar: boolean;
  /** Write activityBar.activeBorder. */
  activityBar: boolean;
}

/** Formatting options passed to jsonc-parser when it has to lay out new text. */
type Formatting = ReturnType<typeof detectFormatting>;

/**
 * @function detectFormatting
 * @description Infers indentation and line endings from existing file contents, so an
 * inserted setting matches the surrounding style (VSCode writes tabs by default).
 * @param {string} text - Current file contents.
 * @returns {{ insertSpaces: boolean; tabSize: number; eol: string }} Formatting options.
 */
function detectFormatting(text: string): {
  insertSpaces: boolean;
  tabSize: number;
  eol: string;
} {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = /^([ \t]+)\S/m.exec(text)?.[1];
  if (!indent || indent.startsWith("\t")) {
    return { insertSpaces: false, tabSize: 4, eol };
  }
  return { insertSpaces: true, tabSize: indent.length, eol };
}

/**
 * @function parseWorkspace
 * @description Parses .code-workspace contents into a syntax tree.
 * @param {string} text - File contents (JSON with comments).
 * @returns {Node} The root object node.
 * @throws {Error} When the contents are not a valid JSONC object.
 */
function parseWorkspace(text: string): Node {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { allowTrailingComma: true });
  if (errors.length > 0 || !root || root.type !== "object") {
    throw new Error("the file is not a valid .code-workspace (JSON) document");
  }
  return root;
}

/**
 * @function asObject
 * @description Narrows a parsed JSON value to a plain object.
 * @param {unknown} value - Parsed value.
 * @returns {Record<string, unknown> | undefined} The object, or undefined.
 */
function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * @function asText
 * @description Returns a trimmed non-empty string, or undefined.
 * @param {unknown} value - Parsed value.
 * @returns {string | undefined}
 */
function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * @function findThemeOverrides
 * @description Lists the theme-scoped blocks ("[Theme Name]": { … }) of a
 * workbench.colorCustomizations value that set any of the managed colors. VSCode
 * applies such blocks after the general values, so they win while that theme is active.
 * @param {unknown} customizations - A workbench.colorCustomizations value.
 * @returns {ThemeOverride[]} Conflicting blocks, in file order.
 */
export function findThemeOverrides(customizations: unknown): ThemeOverride[] {
  const result: ThemeOverride[] = [];
  for (const [scope, block] of Object.entries(asObject(customizations) ?? {})) {
    const colors = asObject(block);
    if (!/^\[.+\]$/.test(scope) || !colors) {
      continue;
    }
    const keys = MANAGED_COLOR_KEYS.filter((k) => k in colors);
    if (keys.length > 0) {
      result.push({ scope, keys });
    }
  }
  return result;
}

/**
 * @function scopeMatchesTheme
 * @description Mirrors VSCode's matching of a theme-scoped customization key against a
 * theme name: the key may hold several scopes ("[A][B]"), each an exact theme name or a
 * pattern with a leading and/or trailing "*" wildcard ("[*Dark*]", "[Ayu*]").
 * @param {string} scope - The block key, e.g. "[Ayu Dark Bordered]".
 * @param {string} theme - The theme name as stored in "workbench.colorTheme".
 * @returns {boolean} True when the block applies to that theme.
 */
export function scopeMatchesTheme(scope: string, theme: string): boolean {
  return (scope.match(/\[(.+?)\]/g) ?? []).some((s) => {
    const id = s.slice(1, -1);
    const lead = id.startsWith("*");
    const trail = id.endsWith("*");
    if (lead && trail) {
      return theme.includes(id.slice(1, -1));
    }
    if (trail) {
      return theme.startsWith(id.slice(0, -1));
    }
    if (lead) {
      return theme.endsWith(id.slice(1));
    }
    return id === theme;
  });
}

/**
 * @function readColorsFromText
 * @description Extracts the color-related settings from .code-workspace contents.
 * @param {string} text - File contents.
 * @returns {WorkspaceColors} The stored values (raw strings, not validated).
 * @throws {Error} When the contents are not a valid JSONC object.
 */
export function readColorsFromText(text: string): WorkspaceColors {
  const workspace = asObject(getNodeValue(parseWorkspace(text)));
  const settings = asObject(workspace?.settings);
  const custom = asObject(settings?.[CUSTOMIZATIONS_KEY]);
  return {
    iconColor: asText(settings?.[ICON_COLOR_KEY]),
    statusBarBackground: asText(custom?.[STATUS_BAR_BACKGROUND]),
    statusBarForeground: asText(custom?.[STATUS_BAR_FOREGROUND]),
    activityBarBorder: asText(custom?.[ACTIVITY_BAR_BORDER]),
    colorTheme: asText(settings?.["workbench.colorTheme"]),
    themeOverrides: findThemeOverrides(custom),
  };
}

/**
 * @function commaAfter
 * @description Finds the comma token that directly follows an offset, skipping
 * whitespace and comments.
 * @param {string} text - File contents.
 * @param {number} offset - Where to start scanning.
 * @returns {number | undefined} Offset of the comma, or undefined if the next token isn't one.
 */
function commaAfter(text: string, offset: number): number | undefined {
  const scanner = createScanner(text, true);
  scanner.setPosition(offset);
  return scanner.scan() === SyntaxKind.CommaToken
    ? scanner.getTokenOffset()
    : undefined;
}

/**
 * @function removeProperty
 * @description Removes the property at a path. When it sits on its own line(s), exactly
 * those lines are deleted (plus the comma it leaves dangling), so neighbouring comments
 * survive; otherwise jsonc-parser's generic removal is used.
 * @param {string} text - File contents.
 * @param {JSONPath} path - Path of the property to remove.
 * @param {Formatting} formatting - Formatting options for the fallback removal.
 * @returns {string} The updated contents (unchanged when the property is absent).
 */
function removeProperty(text: string, path: JSONPath, formatting: Formatting): string {
  const prop = findNodeAtLocation(parseWorkspace(text), path)?.parent;
  const siblings = prop?.parent?.children;
  if (!prop || prop.type !== "property" || !siblings) {
    return text; // nothing to remove
  }

  const end = prop.offset + prop.length;
  const lineStart = text.lastIndexOf("\n", prop.offset - 1) + 1;
  const rest = /^[ \t]*(,)?[ \t]*(\r?\n|$)/.exec(text.slice(end));
  if (!rest || !/^[ \t]*$/.test(text.slice(lineStart, prop.offset))) {
    return applyEdits(
      text,
      modify(text, path, undefined, { formattingOptions: formatting })
    );
  }

  const edits: Edit[] = [
    { offset: lineStart, length: end + rest[0].length - lineStart, content: "" },
  ];
  const index = siblings.indexOf(prop);
  if (index === siblings.length - 1 && !rest[1] && index > 0) {
    // The removed property was last without a comma: drop the previous one's comma.
    const prev = siblings[index - 1];
    const comma = commaAfter(text, prev.offset + prev.length);
    if (comma !== undefined) {
      edits.push({ offset: comma, length: 1, content: "" });
    }
  }
  return applyEdits(text, edits);
}

/**
 * @function applyColorsToText
 * @description Writes a color choice into .code-workspace contents, or with undefined
 * removes every color this extension manages (and an emptied colorCustomizations
 * block). The background always becomes the list icon color; the status bar and
 * activity bar values are written only for the enabled targets — disabled targets are
 * left untouched. Only the affected ranges are edited, so comments, trailing commas and
 * formatting elsewhere are preserved; missing settings blocks are created.
 * @param {string} text - Current file contents (JSON with comments).
 * @param {ColorChoice | undefined} choice - Colors to write, or undefined to reset.
 * @returns {string} The updated file contents.
 * @throws {Error} When the contents are not a valid JSONC object.
 */
export function applyColorsToText(
  text: string,
  choice: ColorChoice | undefined
): string {
  parseWorkspace(text); // validate up front — never edit a malformed file
  const formatting = detectFormatting(text);
  const custom = (key: string): JSONPath => ["settings", CUSTOMIZATIONS_KEY, key];
  const set = (t: string, path: JSONPath, value: string | undefined): string =>
    value === undefined
      ? removeProperty(t, path, formatting)
      : applyEdits(t, modify(t, path, value, { formattingOptions: formatting }));

  if (!choice) {
    let t = set(text, ["settings", ICON_COLOR_KEY], undefined);
    for (const key of MANAGED_COLOR_KEYS) {
      t = set(t, custom(key), undefined);
    }
    const block = findNodeAtLocation(parseWorkspace(t), ["settings", CUSTOMIZATIONS_KEY]);
    return block?.type === "object" && !block.children?.length
      ? set(t, ["settings", CUSTOMIZATIONS_KEY], undefined)
      : t;
  }

  let t = set(text, ["settings", ICON_COLOR_KEY], choice.background);
  if (choice.statusBar) {
    t = set(t, custom(STATUS_BAR_BACKGROUND), choice.background);
    t = set(t, custom(STATUS_BAR_FOREGROUND), choice.foreground);
  }
  if (choice.activityBar) {
    t = set(t, custom(ACTIVITY_BAR_BORDER), choice.background);
  }
  return t;
}

/**
 * @function readWorkspaceColors
 * @description Reads the color-related settings of a .code-workspace file.
 * @param {string} fsPath - Absolute path to the .code-workspace file.
 * @returns {Promise<WorkspaceColors>}
 * @throws {Error} On an unreadable or malformed file.
 */
export async function readWorkspaceColors(fsPath: string): Promise<WorkspaceColors> {
  return readColorsFromText(await fs.promises.readFile(fsPath, "utf8"));
}

/**
 * @function writeWorkspaceColors
 * @description Persists a color choice into a .code-workspace file, or resets its
 * colors when the choice is undefined. Colors are stored lowercased.
 * @param {string} fsPath - Absolute path to the .code-workspace file.
 * @param {ColorChoice | undefined} choice - Colors to write, or undefined to reset.
 * @returns {Promise<void>}
 * @throws {Error} On an invalid color, an unreadable/unwritable or malformed file.
 */
export async function writeWorkspaceColors(
  fsPath: string,
  choice: ColorChoice | undefined
): Promise<void> {
  let normalized: ColorChoice | undefined;
  if (choice) {
    const bad = [choice.background, choice.statusBar ? choice.foreground : "#000"].find(
      (c) => !isHexColor(c)
    );
    if (bad !== undefined) {
      throw new Error(`"${bad}" is not a hex color`);
    }
    normalized = {
      ...choice,
      background: choice.background.trim().toLowerCase(),
      foreground: choice.foreground.trim().toLowerCase(),
    };
  }
  const text = await fs.promises.readFile(fsPath, "utf8");
  const next = applyColorsToText(text, normalized);
  if (next !== text) {
    await fs.promises.writeFile(fsPath, next, "utf8");
  }
}
