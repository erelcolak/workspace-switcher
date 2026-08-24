import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import { expandHome, shortHome } from "./scanner";

/** Configuration section owning every setting of this extension. */
const SECTION = "workspaceSwitcher";
/** Configuration key holding the scanned root folders. */
const KEY = "rootFolders";

/** An action a quick-pick row can trigger in the root-folder manager. */
type RootAction = "add" | "reveal" | "settings";

/** A quick-pick row of the root-folder manager. */
interface RootPick extends vscode.QuickPickItem {
  action: RootAction;
  /** The configured folder string ("~/Developer"), for rows representing a root. */
  value?: string;
}

/**
 * @function getRootFolders
 * @description Reads the configured root folders.
 * @returns {string[]} The configured folders, as stored in settings (may contain "~").
 */
export function getRootFolders(): string[] {
  return vscode.workspace
    .getConfiguration(SECTION)
    .get<string[]>(KEY, ["~/Developer"]);
}

/**
 * @function resolveTarget
 * @description Picks the settings scope to write to: the workspace scope when the value
 * is already defined there, otherwise the user (global) settings. The setting is
 * window-scoped, so the folder scope is never a valid target.
 * @returns {vscode.ConfigurationTarget} The target to write the root folders to.
 */
function resolveTarget(): vscode.ConfigurationTarget {
  const info = vscode.workspace.getConfiguration(SECTION).inspect<string[]>(KEY);
  return info?.workspaceValue !== undefined
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

/**
 * @function saveRootFolders
 * @description Writes the root folder list back to settings.
 * @param {string[]} folders - The new list.
 * @returns {Promise<void>}
 */
async function saveRootFolders(folders: string[]): Promise<void> {
  await vscode.workspace
    .getConfiguration(SECTION)
    .update(KEY, folders, resolveTarget());
}

/**
 * @function toSetting
 * @description Converts an absolute path into the form stored in settings: paths inside
 * the home directory are collapsed to "~/…" so the value stays portable.
 * @param {string} fsPath - Absolute folder path.
 * @returns {string} The value to store in settings.
 */
function toSetting(fsPath: string): string {
  return shortHome(path.normalize(fsPath));
}

/**
 * @function samePath
 * @description Compares two configured folders by their expanded absolute paths,
 * ignoring trailing separators (and case on macOS/Windows).
 * @param {string} a - First folder.
 * @param {string} b - Second folder.
 * @returns {boolean} True when both point at the same directory.
 */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    const abs = path.normalize(expandHome(p)).replace(/[\\/]+$/, "");
    return process.platform === "linux" ? abs : abs.toLowerCase();
  };
  return norm(a) === norm(b);
}

/**
 * @function addRootFolders
 * @description Opens a native folder picker and appends the chosen folders to
 * "workspaceSwitcher.rootFolders", skipping ones that are already configured.
 * @returns {Promise<boolean>} True when the setting was changed.
 */
export async function addRootFolders(): Promise<boolean> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    defaultUri: vscode.Uri.file(os.homedir()),
    openLabel: "Add as Root Folder",
    title: "Select the folder(s) that contain your workspaces",
  });
  if (!picked || picked.length === 0) {
    return false;
  }

  const current = getRootFolders();
  const added: string[] = [];
  const skipped: string[] = [];

  for (const uri of picked) {
    const value = toSetting(uri.fsPath);
    if (
      current.some((f) => samePath(f, value)) ||
      added.some((f) => samePath(f, value))
    ) {
      skipped.push(value);
      continue;
    }
    added.push(value);
  }

  if (added.length === 0) {
    vscode.window.showInformationMessage(
      `Already a root folder: ${skipped.join(", ")}`
    );
    return false;
  }

  await saveRootFolders([...current, ...added]);
  const suffix = skipped.length ? ` (${skipped.length} already added)` : "";
  vscode.window.showInformationMessage(
    `Added root folder${added.length > 1 ? "s" : ""}: ${added.join(", ")}${suffix}`
  );
  return true;
}

/**
 * @function buildPicks
 * @description Builds the quick-pick rows of the manager: the add action, one row per
 * configured root folder (with a remove button), and a shortcut to the settings UI.
 * @param {string[]} folders - The configured root folders.
 * @returns {(RootPick | vscode.QuickPickItem)[]} Rows in display order.
 */
function buildPicks(folders: string[]): (RootPick | vscode.QuickPickItem)[] {
  const rows: (RootPick | vscode.QuickPickItem)[] = [
    {
      label: "$(add) Add root folder…",
      detail: "Pick a folder to scan for .code-workspace files",
      action: "add",
    },
    {
      label: folders.length ? "Root folders" : "No root folders configured",
      kind: vscode.QuickPickItemKind.Separator,
    },
  ];

  for (const folder of folders) {
    const abs = expandHome(folder);
    const missing = !fs.existsSync(abs);
    rows.push({
      label: `$(folder) ${folder}`,
      description: missing ? "$(warning) folder not found" : undefined,
      detail: abs,
      action: "reveal",
      value: folder,
      buttons: [
        {
          iconPath: new vscode.ThemeIcon("trash"),
          tooltip: "Remove this root folder",
        },
      ],
    });
  }

  rows.push(
    { label: "", kind: vscode.QuickPickItemKind.Separator },
    {
      label: "$(settings-gear) Edit in Settings",
      detail: "Open workspaceSwitcher.rootFolders in the Settings editor",
      action: "settings",
    }
  );
  return rows;
}

/**
 * @function manageRootFolders
 * @description Shows the root-folder manager: add a folder through the native picker,
 * remove one with its trash button, reveal one in the OS file manager, or jump to the
 * Settings editor. Stays open across removals so several can be cleaned up at once.
 * @returns {Promise<void>} Resolves once the picker is closed.
 */
export function manageRootFolders(): Promise<void> {
  return new Promise<void>((resolve) => {
    const qp = vscode.window.createQuickPick<RootPick>();
    qp.title = "Workspace Switcher: Root Folders";
    qp.placeholder = "Folders scanned for .code-workspace files";
    qp.items = buildPicks(getRootFolders()) as RootPick[];

    /** Re-reads settings and repaints the rows without closing the picker. */
    const reload = () => {
      qp.items = buildPicks(getRootFolders()) as RootPick[];
    };

    qp.onDidTriggerItemButton(async (e) => {
      const folder = e.item.value;
      if (!folder) {
        return;
      }
      qp.busy = true;
      await saveRootFolders(
        getRootFolders().filter((f) => !samePath(f, folder))
      );
      qp.busy = false;
      reload();
      vscode.window.showInformationMessage(`Removed root folder: ${folder}`);
    });

    qp.onDidAccept(async () => {
      const item = qp.selectedItems[0];
      if (!item) {
        return;
      }
      if (item.action === "add") {
        qp.hide();
        await addRootFolders();
        return;
      }
      if (item.action === "settings") {
        qp.hide();
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          `${SECTION}.${KEY}`
        );
        return;
      }
      if (item.action === "reveal" && item.value) {
        const abs = expandHome(item.value);
        if (!fs.existsSync(abs)) {
          vscode.window.showWarningMessage(`Folder not found: ${abs}`);
          return;
        }
        qp.hide();
        await vscode.commands.executeCommand(
          "revealFileInOS",
          vscode.Uri.file(abs)
        );
      }
    });

    qp.onDidHide(() => {
      qp.dispose();
      resolve();
    });

    qp.show();
  });
}
