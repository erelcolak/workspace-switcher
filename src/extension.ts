import * as vscode from "vscode";
import { scanWorkspaces, shortHome, WorkspaceEntry } from "./scanner";
import {
  WorkspaceTreeProvider,
  WorkspaceItem,
  workspaceIconPath,
} from "./treeProvider";
import { createStatusBar } from "./statusBar";
import { addRootFolders, manageRootFolders } from "./rootFolders";

interface ScanConfig {
  rootFolders: string[];
  maxDepth: number;
  ignoreFolders: string[];
}

/** globalState key holding the most-recently-opened workspace fsPaths (newest first). */
const RECENT_KEY = "workspaceSwitcher.recent";
/** Upper bound on the persisted recents list, independent of how many are displayed. */
const RECENT_STORE_LIMIT = 50;

/**
 * @function getConfig
 * @description Reads the extension configuration from VSCode settings.
 * @returns {ScanConfig} Resolved scan configuration with defaults applied.
 */
function getConfig(): ScanConfig {
  const cfg = vscode.workspace.getConfiguration("workspaceSwitcher");
  return {
    rootFolders: cfg.get<string[]>("rootFolders", ["~/Developer"]),
    maxDepth: cfg.get<number>("maxDepth", 4),
    ignoreFolders: cfg.get<string[]>("ignoreFolders", []),
  };
}

/**
 * @function getRecentCount
 * @description Reads how many entries the "Recently Used" section should hold.
 * @returns {number} A non-negative integer (defaults to 3).
 */
function getRecentCount(): number {
  const cfg = vscode.workspace.getConfiguration("workspaceSwitcher");
  const raw = cfg.get<number>("lastUsedWorkspaceCount", 3);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/**
 * @function loadEntries
 * @description Scans the configured roots and returns discovered workspaces.
 * @returns {Promise<WorkspaceEntry[]>}
 */
async function loadEntries(): Promise<WorkspaceEntry[]> {
  const { rootFolders, maxDepth, ignoreFolders } = getConfig();
  return scanWorkspaces(rootFolders, maxDepth, ignoreFolders);
}

/**
 * @function recordRecent
 * @description Promotes a workspace to the front of the persisted recents list
 * (deduplicated, capped) so it surfaces in the "Recently Used" section.
 * @param {vscode.ExtensionContext} context - Extension context (for globalState).
 * @param {string} fsPath - Absolute path of the opened .code-workspace file.
 * @returns {Promise<void>}
 */
async function recordRecent(
  context: vscode.ExtensionContext,
  fsPath: string
): Promise<void> {
  const prev = context.globalState.get<string[]>(RECENT_KEY, []);
  const next = [fsPath, ...prev.filter((p) => p !== fsPath)].slice(
    0,
    RECENT_STORE_LIMIT
  );
  await context.globalState.update(RECENT_KEY, next);
}

/**
 * @function openEntry
 * @description Records the workspace as recently used, then opens it in VSCode.
 * The recents write is awaited first so it persists even when opening in the
 * current window tears down the extension host.
 * @param {vscode.ExtensionContext} context - Extension context (for globalState).
 * @param {WorkspaceEntry} entry - The workspace to open.
 * @param {boolean} forceNewWindow - Open in a new window when true.
 * @returns {Promise<void>}
 */
async function openEntry(
  context: vscode.ExtensionContext,
  entry: WorkspaceEntry,
  forceNewWindow: boolean
): Promise<void> {
  await recordRecent(context, entry.fsPath);
  const uri = vscode.Uri.file(entry.fsPath);
  await vscode.commands.executeCommand("vscode.openFolder", uri, {
    forceNewWindow,
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const storageDir = context.globalStorageUri.fsPath;
  const treeProvider = new WorkspaceTreeProvider(
    loadEntries,
    storageDir,
    () => context.globalState.get<string[]>(RECENT_KEY, []),
    getRecentCount
  );
  const treeView = vscode.window.createTreeView("workspaceSwitcherView", {
    treeDataProvider: treeProvider,
  });

  context.subscriptions.push(
    treeView,
    createStatusBar(),

    vscode.commands.registerCommand("workspaceSwitcher.refresh", () =>
      treeProvider.refresh()
    ),

    vscode.commands.registerCommand("workspaceSwitcher.manageRootFolders", () =>
      manageRootFolders()
    ),

    vscode.commands.registerCommand("workspaceSwitcher.addRootFolder", () =>
      addRootFolders()
    ),

    vscode.commands.registerCommand(
      "workspaceSwitcher.openInNewWindow",
      async (item?: WorkspaceItem) => {
        if (item) {
          await openEntry(context, item.entry, true);
          treeProvider.refresh();
        }
      }
    ),

    vscode.commands.registerCommand(
      "workspaceSwitcher.openInCurrentWindow",
      async (item?: WorkspaceItem) => {
        if (item) {
          await openEntry(context, item.entry, false);
        }
      }
    ),

    vscode.commands.registerCommand("workspaceSwitcher.quickPick", async () => {
      const entries = await loadEntries();
      if (entries.length === 0) {
        const action = await vscode.window.showInformationMessage(
          "No workspaces found under the configured root folders.",
          "Add Root Folder\u2026"
        );
        if (action) {
          await manageRootFolders();
        }
        return;
      }

      const picks = entries.map((e) => ({
        label: e.name,
        iconPath: workspaceIconPath(storageDir, e.color),
        description: shortHome(e.parentDir),
        detail: e.fsPath,
        entry: e,
      }));

      const chosen = await vscode.window.showQuickPick(picks, {
        placeHolder: "Select a workspace to open (opens in a new window)",
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (chosen) {
        await openEntry(context, chosen.entry, true);
        treeProvider.refresh();
      }
    }),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("workspaceSwitcher")) {
        treeProvider.refresh();
      }
    })
  );

  // Initial scan.
  treeProvider.refresh();
}

export function deactivate(): void {
  // Nothing to clean up beyond context.subscriptions.
}
