import * as crypto from "crypto";
import * as vscode from "vscode";
import { WorkspaceEntry, shortHome } from "./scanner";
import { LAYERS_PATH, isHexColor } from "./colorIcon";
import { workspaceIconPath } from "./treeProvider";
import {
  ColorChoice,
  ThemeOverride,
  WorkspaceColors,
  findThemeOverrides,
  readWorkspaceColors,
  scopeMatchesTheme,
  writeWorkspaceColors,
} from "./workspaceColor";

/**
 * Preset swatches — the 900 shades of Vercel's Geist palette (var(--ds-<color>-900)),
 * dark-theme values as shown on vercel.com/geist/colors: the stylesheet's lab() / P3
 * definitions converted to sRGB hex (its plain hex fallbacks differ slightly).
 */
const PRESETS: { name: string; hex: string }[] = [
  { name: "Gray 900", hex: "#a1a1a1" },
  { name: "Blue 900", hex: "#47a8ff" },
  { name: "Red 900", hex: "#ff565f" },
  { name: "Amber 900", hex: "#ff9300" },
  { name: "Green 900", hex: "#00ca50" },
  { name: "Teal 900", hex: "#00cfb7" },
  { name: "Purple 900", hex: "#c472fb" },
  { name: "Pink 900", hex: "#ff4d8d" },
];

/** Status bar text colors offered next to Auto — also the two colors Auto picks from. */
const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#1f1f1f";
const FOREGROUND_PRESETS: { name: string; hex: string }[] = [
  { name: "White", hex: LIGHT_TEXT },
  { name: "Dark", hex: DARK_TEXT },
];

/** Messages posted by the picker webview. */
type PickerMessage =
  | ({ type: "apply" } & ColorChoice)
  | { type: "reset" }
  | { type: "cancel" };

/** A theme-scoped block that outranks the workspace colors, and where it is defined. */
interface OverrideNotice extends ThemeOverride {
  source: string;
}

/** Initial data handed to the webview. */
interface PickerState {
  name: string;
  dir: string;
  /** Current background (hex) or "" when none is set. */
  background: string;
  /** Stored status bar foreground (hex) or ""; restored when Automatic is turned off. */
  foreground: string;
  /** True when the file holds any color this picker manages (enables Reset). */
  hasColors: boolean;
  /** Color theme the workspace opens with (its own setting, else the user's). */
  theme: string;
  /** Theme-scoped blocks for that theme which override the managed colors. */
  overrides: OverrideNotice[];
}

/** The single open picker panel, reused when another workspace is picked. */
let panel: vscode.WebviewPanel | undefined;
/** The workspace the open panel is editing. */
let target: WorkspaceEntry | undefined;

/**
 * @function isPickerMessage
 * @description Narrows an untyped webview message to a known picker message.
 * @param {unknown} msg - Message received from the webview.
 * @returns {boolean} True when the message has a known shape.
 */
function isPickerMessage(msg: unknown): msg is PickerMessage {
  if (typeof msg !== "object" || msg === null) {
    return false;
  }
  const m = msg as Record<string, unknown>;
  if (m.type === "apply") {
    return (
      typeof m.background === "string" &&
      typeof m.foreground === "string" &&
      typeof m.statusBar === "boolean" &&
      typeof m.activityBar === "boolean"
    );
  }
  return m.type === "reset" || m.type === "cancel";
}

/**
 * @function hasUnsavedEditor
 * @description Reports whether the file is open in an editor with unsaved changes;
 * writing it on disk underneath would cause a save conflict.
 * @param {string} fsPath - Absolute file path.
 * @returns {boolean} True when an open document for the file is dirty.
 */
function hasUnsavedEditor(fsPath: string): boolean {
  return vscode.workspace.textDocuments.some(
    (d) => d.isDirty && d.uri.scheme === "file" && d.uri.fsPath === fsPath
  );
}

/**
 * @function buildState
 * @description Collects what the picker shows: current colors from the file, the theme
 * the workspace opens with, and the customizations scoped to that theme (in User
 * settings or in the file itself) that would outrank the colors written here.
 * @param {WorkspaceEntry} entry - The workspace being edited.
 * @param {WorkspaceColors} colors - Its stored color settings.
 * @returns {PickerState} The initial webview state.
 */
function buildState(entry: WorkspaceEntry, colors: WorkspaceColors): PickerState {
  const hex = (c: string | undefined) => (isHexColor(c) ? c.trim().toLowerCase() : "");
  const workbench = vscode.workspace.getConfiguration("workbench");
  const theme = workbench.inspect<string>("colorTheme");
  const userColors = workbench.inspect<unknown>("colorCustomizations")?.globalValue;
  const activeTheme =
    colors.colorTheme ?? theme?.globalValue ?? theme?.defaultValue ?? "";

  return {
    name: entry.name,
    dir: shortHome(entry.parentDir),
    background: hex(colors.iconColor) || hex(colors.statusBarBackground),
    foreground: hex(colors.statusBarForeground),
    hasColors: [
      colors.iconColor,
      colors.statusBarBackground,
      colors.statusBarForeground,
      colors.activityBarBorder,
    ].some((c) => c !== undefined),
    theme: activeTheme,
    overrides: [
      ...findThemeOverrides(userColors).map((o) => ({ ...o, source: "User settings" })),
      ...colors.themeOverrides.map((o) => ({ ...o, source: "This workspace file" })),
    ].filter((o) => activeTheme && scopeMatchesTheme(o.scope, activeTheme)),
  };
}

/**
 * @function renderHtml
 * @description Builds the picker page: a live preview (activity bar, list row, status
 * bar), background and foreground color controls, the targets to apply them to, a note
 * on how theme-specific customizations take precedence, and Apply / Reset / Cancel.
 * All workspace-derived text is inserted with textContent from the JSON state.
 * @param {PickerState} state - Initial webview state.
 * @returns {string} The webview HTML.
 */
function renderHtml(state: PickerState): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const json = JSON.stringify(state).replace(/</g, "\\u003c");
  const swatches = (presets: { name: string; hex: string }[]) =>
    presets
      .map(
        (p) =>
          `<button type="button" class="swatch" data-color="${p.hex}" ` +
          `title="${p.name} · ${p.hex}" aria-label="${p.name}" aria-pressed="false"></button>`
      )
      .join("");
  const layers = `<path fill-rule="evenodd" d="${LAYERS_PATH}"/>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Workspace Colors</title>
<style nonce="${nonce}">
  body {
    margin: 0;
    padding: 0 16px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }
  .picker { max-width: 460px; margin: 28px auto 40px; display: grid; gap: 22px; }
  h1 { font-size: 1.3em; font-weight: 600; margin: 0 0 4px; }
  .lead, .hint { margin: 0; color: var(--vscode-descriptionForeground); }
  .hint { margin-top: -4px; margin-bottom: 10px; font-size: 0.92em; }
  h2, legend {
    margin: 0 0 8px; padding: 0; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground);
  }
  code {
    font-family: var(--vscode-editor-font-family); font-size: 0.9em;
    padding: 1px 4px; border-radius: 3px;
    background: var(--vscode-textCodeBlock-background);
  }

  /* Preview: a miniature window with activity bar, list row and status bar. */
  .mock {
    margin: 0; overflow: hidden; border-radius: 6px;
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, transparent));
    background: var(--vscode-sideBar-background);
  }
  .mock-main { display: flex; height: 92px; }
  .mock-activity { width: 42px; flex: none; background: var(--vscode-activityBar-background); }
  .mock-act {
    height: 40px; display: grid; place-items: center;
    border-left: 2px solid transparent;
    color: var(--vscode-activityBar-inactiveForeground);
  }
  .mock-act.is-active {
    color: var(--vscode-activityBar-foreground);
    border-left-color: var(--vscode-activityBar-activeBorder, transparent);
  }
  .mock-act svg { width: 20px; height: 20px; fill: currentColor; }
  .mock-act svg.stroke { fill: none; stroke: currentColor; stroke-width: 1.8; }
  .mock-side { flex: 1; min-width: 0; padding: 8px 0; }
  .mock-row {
    display: flex; align-items: center; gap: 6px; min-width: 0; padding: 3px 12px;
    background: var(--vscode-list-hoverBackground);
  }
  .mock-row svg { width: 16px; height: 16px; flex: none; }
  #row-icon { fill: var(--vscode-icon-foreground); }
  .mock-row .name { white-space: nowrap; }
  .mock-row .dir {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--vscode-descriptionForeground); font-size: 0.92em;
  }
  .mock-line { height: 6px; margin: 10px 12px 0; border-radius: 3px; background: var(--vscode-descriptionForeground); opacity: 0.18; }
  .mock-line.short { width: 45%; }
  .mock-status {
    display: flex; align-items: center; gap: 14px; height: 22px; padding: 0 10px;
    font-size: 12px; white-space: nowrap; overflow: hidden;
    color: var(--vscode-statusBar-foreground);
    background: var(--vscode-statusBar-background);
  }
  .mock-status svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; vertical-align: -3px; margin-right: 4px; }

  /* Color controls: presets aligned left, picker + hex aligned right */
  .color-row {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 10px 16px;
  }
  .presets { display: flex; align-items: center; gap: 10px; }
  .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
  .swatch {
    width: 24px; height: 24px; padding: 0; border-radius: 50%; cursor: pointer;
    border: 1px solid rgba(128, 128, 128, 0.35);
  }
  .swatch:disabled { cursor: default; }
  .swatch[aria-pressed="true"],
  .swatch:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .auto { display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
  .auto input[type="checkbox"] { margin: 0; }
  .divider { width: 1px; height: 18px; background: var(--vscode-widget-border, rgba(128, 128, 128, 0.35)); }
  .custom { display: flex; gap: 6px; align-items: center; margin-left: auto; } /* stays right when wrapped */
  input[type="color"] {
    width: 32px; height: 26px; padding: 1px 2px; cursor: pointer; border-radius: 2px;
    border: 1px solid var(--vscode-input-border, transparent);
    background: var(--vscode-input-background);
  }
  input[type="text"] {
    width: 80px; height: 24px; padding: 0 6px; border-radius: 2px;
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
  }
  input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  input.invalid { border-color: var(--vscode-inputValidation-errorBorder); }
  input[type="checkbox"] { margin: 2px 0 0; accent-color: var(--vscode-button-background); }
  .error { margin: 6px 0 0; color: var(--vscode-errorForeground); }
  .is-disabled { opacity: 0.55; }

  /* Targets */
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
  .check { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; cursor: pointer; }
  .check .keys { display: block; margin-top: 3px; color: var(--vscode-descriptionForeground); }
  .check.fixed { cursor: default; }

  /* Theme override warning */
  .note {
    margin: 0; padding: 8px 12px; border-radius: 0 4px 4px 0;
    border-left: 3px solid var(--vscode-editorWarning-foreground);
    background: var(--vscode-textBlockQuote-background);
  }

  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .actions button {
    height: 26px; padding: 0 14px; border-radius: 2px; cursor: pointer; font: inherit;
    border: 1px solid var(--vscode-button-border, transparent);
  }
  .actions button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  .secondary {
    color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground);
  }
  .secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  #reset { margin-left: auto; }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
</head>
<body>
<main class="picker">
  <header>
    <h1>Workspace Colors</h1>
    <p class="lead">Saved to the settings of this .code-workspace file.</p>
  </header>

  <figure class="mock" aria-label="Preview">
    <div class="mock-main">
      <div class="mock-activity">
        <div class="mock-act is-active" id="mock-active"><svg viewBox="0 0 24 24" aria-hidden="true">${layers}</svg></div>
        <div class="mock-act"><svg class="stroke" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></svg></div>
      </div>
      <div class="mock-side">
        <div class="mock-row">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path id="row-icon" fill-rule="evenodd" d="${LAYERS_PATH}"/></svg>
          <span class="name" id="row-name"></span>
          <span class="dir" id="row-dir"></span>
        </div>
        <div class="mock-line"></div>
        <div class="mock-line short"></div>
      </div>
    </div>
    <div class="mock-status" id="mock-status">
      <span><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11" cy="5.5" r="1.5"/><path d="M5 5v6M11 7c0 2.5-6 2-6 4"/></svg>main</span>
      <span id="status-name"></span>
    </div>
  </figure>

  <section>
    <h2>Background color</h2>
    <p class="hint">List icon, status bar background and activity bar border.</p>
    <div class="color-row">
      <div class="swatches" id="bg-swatches">${swatches(PRESETS)}</div>
      <div class="custom">
        <input type="color" id="bg-native" value="#888888" aria-label="Open color picker for the background color">
        <input type="text" id="bg-hex" placeholder="#148d3e" spellcheck="false" autocomplete="off" aria-label="Background hex color">
      </div>
    </div>
    <p id="bg-error" class="error" role="alert" hidden>Use a hex color such as #148d3e.</p>
  </section>

  <section id="fg-section">
    <h2>Foreground color</h2>
    <p class="hint" id="fg-hint">Status bar text and icons.</p>
    <div class="color-row">
      <div class="presets">
        <label class="auto" title="White or dark text, whichever contrasts more with the background"><input type="checkbox" id="fg-auto">Auto</label>
        <span class="divider" aria-hidden="true"></span>
        <div class="swatches" id="fg-swatches">${swatches(FOREGROUND_PRESETS)}</div>
      </div>
      <div class="custom">
        <input type="color" id="fg-native" value="#ffffff" aria-label="Open color picker for the foreground color">
        <input type="text" id="fg-hex" placeholder="#ffffff" spellcheck="false" autocomplete="off" aria-label="Foreground hex color">
      </div>
    </div>
    <p id="fg-error" class="error" role="alert" hidden>Use a hex color such as #ffffff.</p>
  </section>

  <fieldset>
    <legend>Apply to</legend>
    <label class="check fixed"><input type="checkbox" checked disabled><span>Workspace list icon<span class="keys"><code>workspaceSwitcher.iconColor</code></span></span></label>
    <label class="check"><input type="checkbox" id="t-status" checked><span>Status bar<span class="keys"><code>statusBar.background</code> <code>statusBar.foreground</code></span></span></label>
    <label class="check"><input type="checkbox" id="t-activity" checked><span>Activity bar active item border<span class="keys"><code>activityBar.activeBorder</code></span></span></label>
  </fieldset>

  <p class="note" id="note" role="status" hidden></p>

  <div class="actions">
    <button type="button" id="apply" class="primary">Apply</button>
    <button type="button" id="cancel" class="secondary">Cancel</button>
    <button type="button" id="reset" class="secondary" title="Remove the icon, status bar and activity bar colors from this workspace">Reset to Default</button>
  </div>
</main>
<script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  const state = ${json};
  const HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const LIGHT_TEXT = "${LIGHT_TEXT}", DARK_TEXT = "${DARK_TEXT}";
  const $ = (id) => document.getElementById(id);
  const el = {
    rowIcon: $("row-icon"), status: $("mock-status"), active: $("mock-active"),
    bgHex: $("bg-hex"), bgNative: $("bg-native"), bgError: $("bg-error"),
    fgSection: $("fg-section"), fgHint: $("fg-hint"), fgAuto: $("fg-auto"),
    fgHex: $("fg-hex"), fgNative: $("fg-native"), fgError: $("fg-error"),
    useStatus: $("t-status"), useActivity: $("t-activity"),
    apply: $("apply"), reset: $("reset"), cancel: $("cancel"),
  };
  const bgSwatches = [...document.querySelectorAll("#bg-swatches .swatch")];
  const fgSwatches = [...document.querySelectorAll("#fg-swatches .swatch")];
  /** Marks the swatch matching the given color (none when the color is invalid). */
  const press = (list, color, ok) =>
    list.forEach((s) =>
      s.setAttribute("aria-pressed", String(ok && s.dataset.color === color.toLowerCase()))
    );
  let bg = state.background;
  let fg = "";
  let fgAuto = true; // Automatic is on by default, even when the file stores a foreground
  let busy = false;

  /** <input type="color"> only accepts #rrggbb: expand #rgb(a), drop alpha. */
  const toNative = (c) => {
    let h = c.slice(1);
    if (h.length <= 4) h = [...h.slice(0, 3)].map((x) => x + x).join("");
    return "#" + h.slice(0, 6).toLowerCase();
  };
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(toNative(c).slice(i, i + 2), 16));
  const luminance = (c) =>
    rgb(c)
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** White or dark text — whichever contrasts more with the background. */
  const autoForeground = (c) =>
    contrast(c, LIGHT_TEXT) >= contrast(c, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;

  const render = () => {
    const bgOk = HEX.test(bg);
    if (fgAuto) fg = bgOk ? autoForeground(bg) : "";
    const fgOk = HEX.test(fg);
    const useStatus = el.useStatus.checked;
    const useActivity = el.useActivity.checked;

    el.rowIcon.style.fill = bgOk ? bg : "";
    el.status.style.backgroundColor = useStatus && bgOk ? bg : "";
    el.status.style.color = useStatus && fgOk ? fg : "";
    el.active.style.borderLeftColor = useActivity && bgOk ? bg : "";

    press(bgSwatches, bg, bgOk);
    const bgBad = !bgOk && bg !== "";
    el.bgError.hidden = !bgBad;
    el.bgHex.classList.toggle("invalid", bgBad);

    el.fgAuto.checked = fgAuto;
    if (fgAuto) {
      el.fgHex.value = fg;
      if (fgOk) el.fgNative.value = toNative(fg);
    }
    press(fgSwatches, fg, fgOk);
    [el.fgAuto, el.fgHex, el.fgNative, ...fgSwatches].forEach((i) => (i.disabled = !useStatus));
    el.fgSection.classList.toggle("is-disabled", !useStatus);
    el.fgHint.textContent = useStatus
      ? "Status bar text and icons."
      : "Only used by the status bar, which is unchecked below.";
    const fgBad = useStatus && !fgOk && !fgAuto && fg !== "";
    el.fgError.hidden = !fgBad;
    el.fgHex.classList.toggle("invalid", fgBad);

    el.apply.disabled = busy || !bgOk || (useStatus && !fgOk);
    el.reset.disabled = busy || !state.hasColors;
    el.cancel.disabled = busy;
  };

  const setBackground = (value, source) => {
    bg = value.trim();
    if (source !== "hex") el.bgHex.value = bg;
    if (source !== "native" && HEX.test(bg)) el.bgNative.value = toNative(bg);
    render();
  };
  const setForeground = (value, source) => {
    fgAuto = false;
    fg = value.trim();
    if (source !== "hex") el.fgHex.value = fg;
    if (source !== "native" && HEX.test(fg)) el.fgNative.value = toNative(fg);
    render();
  };
  const submit = (msg) => {
    busy = true;
    render();
    vscode.postMessage(msg);
  };

  bgSwatches.forEach((s) => s.addEventListener("click", () => setBackground(s.dataset.color, "swatch")));
  fgSwatches.forEach((s) => s.addEventListener("click", () => setForeground(s.dataset.color, "swatch")));
  el.bgNative.addEventListener("input", () => setBackground(el.bgNative.value, "native"));
  el.bgHex.addEventListener("input", () => setBackground(el.bgHex.value, "hex"));
  el.fgNative.addEventListener("input", () => setForeground(el.fgNative.value, "native"));
  el.fgHex.addEventListener("input", () => setForeground(el.fgHex.value, "hex"));
  el.fgAuto.addEventListener("change", () => {
    if (!el.fgAuto.checked && state.foreground) {
      setForeground(state.foreground, "restore"); // back to the color stored in the file
    } else {
      fgAuto = el.fgAuto.checked;
      render();
    }
  });
  el.useStatus.addEventListener("change", render);
  el.useActivity.addEventListener("change", render);
  el.apply.addEventListener("click", () =>
    submit({
      type: "apply",
      background: bg,
      foreground: fg,
      statusBar: el.useStatus.checked,
      activityBar: el.useActivity.checked,
    })
  );
  el.reset.addEventListener("click", () => submit({ type: "reset" }));
  el.cancel.addEventListener("click", () => vscode.postMessage({ type: "cancel" }));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      vscode.postMessage({ type: "cancel" });
    } else if (e.key === "Enter" && e.target.tagName !== "BUTTON" && !el.apply.disabled) {
      e.preventDefault();
      el.apply.click();
    }
  });
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "failed") {
      busy = false;
      render();
    }
  });

  [...bgSwatches, ...fgSwatches].forEach((s) => (s.style.backgroundColor = s.dataset.color));

  // Static text from the state (textContent — never parsed as HTML).
  $("row-name").textContent = state.name;
  $("row-dir").textContent = state.dir;
  $("status-name").textContent = state.name;
  if (state.overrides.length) {
    const note = $("note");
    const keys = [...new Set(state.overrides.flatMap((o) => o.keys))];
    note.textContent = "⚠ Your theme (" + state.theme + ") overrides " + keys.join(", ") + ".";
    note.title = state.overrides
      .map((o) => o.source + " › workbench.colorCustomizations › " + o.scope)
      .join("\\n");
    note.hidden = false;
  }

  setBackground(bg, "init");
  (bg ? el.bgHex : bgSwatches[0]).focus();
})();
</script>
</body>
</html>`;
}

/**
 * @function handleMessage
 * @description Applies a picker action to the target workspace file. On success the
 * panel closes and the list is refreshed; on failure the error is shown and the panel
 * stays open so the user can retry.
 * @param {unknown} msg - Message received from the webview.
 * @param {() => void} onChanged - Called after the file was updated.
 * @returns {Promise<void>}
 */
async function handleMessage(msg: unknown, onChanged: () => void): Promise<void> {
  if (!panel || !target || !isPickerMessage(msg)) {
    return;
  }
  if (msg.type === "cancel") {
    panel.dispose();
    return;
  }

  const entry = target;
  const choice: ColorChoice | undefined =
    msg.type === "apply"
      ? {
          background: msg.background,
          foreground: msg.foreground,
          statusBar: msg.statusBar,
          activityBar: msg.activityBar,
        }
      : undefined;
  try {
    if (hasUnsavedEditor(entry.fsPath)) {
      throw new Error(
        "the file has unsaved changes in an editor — save or revert it first"
      );
    }
    await writeWorkspaceColors(entry.fsPath, choice);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Could not update "${entry.name}": ${reason}`);
    panel?.webview.postMessage({ type: "failed" });
    return;
  }

  onChanged();
  vscode.window.setStatusBarMessage(
    choice
      ? `$(check) ${entry.name}: colors set to ${choice.background.trim().toLowerCase()}`
      : `$(check) ${entry.name}: colors reset to default`,
    4000
  );
  panel?.dispose();
}

/**
 * @function showColorPicker
 * @description Opens (or retargets) the color picker for a workspace. The background is
 * written to "workspaceSwitcher.iconColor" and, for the enabled targets, to the status
 * bar / activity bar entries of "workbench.colorCustomizations" in the workspace's
 * .code-workspace file; the foreground goes to "statusBar.foreground".
 * @param {WorkspaceEntry} entry - The workspace to recolor.
 * @param {string} storageDir - Directory where generated icons are stored.
 * @param {() => void} onChanged - Called after the file was updated (e.g. to refresh).
 * @returns {Promise<void>} Resolves once the panel is shown (or an error was reported).
 */
export async function showColorPicker(
  entry: WorkspaceEntry,
  storageDir: string,
  onChanged: () => void
): Promise<void> {
  let colors: WorkspaceColors;
  try {
    colors = await readWorkspaceColors(entry.fsPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Could not read "${entry.name}": ${reason}`);
    return;
  }

  target = entry;
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "workspaceSwitcher.colorPicker",
      "",
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [] }
    );
    panel.onDidDispose(() => {
      panel = undefined;
      target = undefined;
    });
    panel.webview.onDidReceiveMessage((msg) => handleMessage(msg, onChanged));
  }

  const icon = workspaceIconPath(storageDir, entry.color);
  panel.iconPath = icon instanceof vscode.ThemeIcon ? undefined : icon;
  panel.title = `Colors: ${entry.name}`;
  panel.webview.html = renderHtml(buildState(entry, colors));
  panel.reveal(vscode.ViewColumn.Active);
}
