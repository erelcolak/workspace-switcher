import * as fs from "fs";
import * as path from "path";

/** Matches #rgb, #rgba, #rrggbb and #rrggbbaa hex color strings. */
const HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Layers (stacked sheets) path — kept in sync with media/workspaces.svg so the
 * list icon matches the Activity Bar icon. If the logo changes, update both.
 */
const LAYERS_PATH =
  "M12 2.5 2.5 7 12 11.5 21.5 7 12 2.5Zm0 1.66L18.6 7 12 9.84 5.4 7 12 4.16Z" +
  "M3.06 11.2 12 15.39l8.94-4.19 1.56.73-10.5 4.92-10.5-4.92 1.56-.73Z" +
  "m0 4.2L12 19.59l8.94-4.19 1.56.73L12 21.05 1.5 16.13l1.56-.73Z";

/** Default fill for the uncolored icon, per theme kind (matches VSCode icon foreground). */
const DEFAULT_DARK = "#c5c5c5";
const DEFAULT_LIGHT = "#424242";

/**
 * @function isHexColor
 * @description Validates that a string is a hex color (#rgb, #rgba, #rrggbb, #rrggbbaa).
 * @param {string | undefined} color - Candidate color string.
 * @returns {boolean} True when the string is a safe hex color.
 */
export function isHexColor(color: string | undefined): color is string {
  return typeof color === "string" && HEX_COLOR.test(color.trim());
}

/**
 * @function writeLayersIcon
 * @description Writes (once, cached by file name) a 16px layers SVG filled with the
 * given color and returns its path.
 * @param {string} storageDir - Directory where generated icons are stored.
 * @param {string} hex - Fill color.
 * @param {string} baseName - File name without extension.
 * @returns {string} Absolute path to the SVG file.
 */
function writeLayersIcon(storageDir: string, hex: string, baseName: string): string {
  const file = path.join(storageDir, `${baseName}.svg`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(storageDir, { recursive: true });
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" ` +
      `viewBox="0 0 24 24"><path fill="${hex}" fill-rule="evenodd" d="${LAYERS_PATH}"/></svg>`;
    fs.writeFileSync(file, svg, "utf8");
  }
  return file;
}

/**
 * @function colorIconFile
 * @description Returns the path to a layers icon filled with the given color, created
 * under storageDir on first use (cached by color). Returns undefined when no valid hex
 * color is supplied, so callers can fall back to the default icon.
 * @param {string} storageDir - Directory where generated icon files are stored.
 * @param {string | undefined} color - Hex color (e.g. "#d173f1").
 * @returns {string | undefined} Absolute path to the SVG file, or undefined.
 */
export function colorIconFile(
  storageDir: string,
  color: string | undefined
): string | undefined {
  if (!isHexColor(color)) {
    return undefined;
  }
  const hex = color.trim().toLowerCase();
  try {
    return writeLayersIcon(storageDir, hex, `icon-${hex.slice(1)}`);
  } catch {
    return undefined; // storage not writable — fall back to default icon
  }
}

/**
 * @function defaultIconFiles
 * @description Returns theme-aware (light/dark) paths to the default uncolored layers
 * icon, so it adapts to the active theme just like a codicon would.
 * @param {string} storageDir - Directory where generated icon files are stored.
 * @returns {{ light: string; dark: string } | undefined} Icon paths, or undefined.
 */
export function defaultIconFiles(
  storageDir: string
): { light: string; dark: string } | undefined {
  try {
    return {
      dark: writeLayersIcon(storageDir, DEFAULT_DARK, "icon-default-dark"),
      light: writeLayersIcon(storageDir, DEFAULT_LIGHT, "icon-default-light"),
    };
  } catch {
    return undefined; // storage not writable — caller falls back to codicon
  }
}
