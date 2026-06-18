import * as vscode from "vscode";
import { WorkspaceEntry, shortHome } from "./scanner";
import { colorIconFile, defaultIconFiles } from "./colorIcon";

/** An icon path usable by tree items and quick-pick items. */
type IconPath =
  | vscode.Uri
  | { light: vscode.Uri; dark: vscode.Uri }
  | vscode.ThemeIcon;

/**
 * @function workspaceIconPath
 * @description Resolves the list icon for a workspace: a colored layers icon when the
 * entry has a valid color, otherwise the theme-aware default layers icon (falling back
 * to the "layers" codicon if icons cannot be generated). Only the icon is colored —
 * the workspace name is never restyled.
 * @param {string} storageDir - Directory where generated icons are stored.
 * @param {string | undefined} color - The entry's icon color, if any.
 * @returns {IconPath} The resolved icon path.
 */
export function workspaceIconPath(
  storageDir: string,
  color: string | undefined
): IconPath {
  const colored = colorIconFile(storageDir, color);
  if (colored) {
    return vscode.Uri.file(colored);
  }
  const def = defaultIconFiles(storageDir);
  if (def) {
    return { light: vscode.Uri.file(def.light), dark: vscode.Uri.file(def.dark) };
  }
  return new vscode.ThemeIcon("layers");
}

/** Tree item representing a single discovered workspace. */
export class WorkspaceItem extends vscode.TreeItem {
  /**
   * @param {WorkspaceEntry} entry - The workspace this item represents.
   * @param {string} storageDir - Directory where generated icons are stored.
   * @param {string} idPrefix - Namespace for the tree item id; lets the same workspace
   * appear under both the "Recently Used" and "All" sections without an id clash.
   */
  constructor(
    public readonly entry: WorkspaceEntry,
    storageDir: string,
    idPrefix = "all"
  ) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);

    this.id = `${idPrefix}:${entry.fsPath}`;
    this.tooltip = entry.fsPath;
    this.description = shortHome(entry.parentDir);
    this.resourceUri = vscode.Uri.file(entry.fsPath);
    this.contextValue = "workspaceItem";
    this.iconPath = workspaceIconPath(storageDir, entry.color);

    // Single click opens in a new window (primary action).
    this.command = {
      command: "workspaceSwitcher.openInNewWindow",
      title: "Open in New Window",
      arguments: [this],
    };
  }
}

/** Tree item representing a collapsible section header ("Recently Used" / "All"). */
export class SectionItem extends vscode.TreeItem {
  constructor(label: string, public readonly children: WorkspaceItem[]) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.id = `section:${label}`;
    this.contextValue = "workspaceSection";
  }
}

/** A node in the workspace tree: a section header or a workspace row. */
export type TreeNode = SectionItem | WorkspaceItem;

/** Provides the workspace list to the Activity Bar tree view. */
export class WorkspaceTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** All discovered workspaces (the "All" list). */
  private items: WorkspaceItem[] = [];
  /** Most recently opened workspaces (the "Recently Used" list). */
  private recentItems: WorkspaceItem[] = [];
  /** When true, the view is split into "Recently Used" + "All" sections. */
  private grouped = false;

  /**
   * @param {() => Promise<WorkspaceEntry[]>} load - Re-scans and returns workspaces.
   * @param {string} storageDir - Directory where generated icons are stored.
   * @param {() => string[]} getRecentPaths - Returns recently opened fsPaths, newest first.
   * @param {() => number} getRecentCount - Returns the configured recent-section size.
   */
  constructor(
    private readonly load: () => Promise<WorkspaceEntry[]>,
    private readonly storageDir: string,
    private readonly getRecentPaths: () => string[],
    private readonly getRecentCount: () => number
  ) {}

  /**
   * @function refresh
   * @description Re-scans workspaces, recomputes the "Recently Used" section, and
   * updates the tree view. The recent section only appears when the total number of
   * workspaces exceeds the configured count and at least one recent entry still exists.
   * @returns {Promise<void>}
   */
  async refresh(): Promise<void> {
    const entries = await this.load();
    this.items = entries.map((e) => new WorkspaceItem(e, this.storageDir, "all"));

    const count = this.getRecentCount();
    const byPath = new Map(entries.map((e) => [e.fsPath, e]));
    const recent: WorkspaceItem[] = [];
    for (const p of this.getRecentPaths()) {
      const entry = byPath.get(p);
      if (entry) {
        recent.push(new WorkspaceItem(entry, this.storageDir, "recent"));
      }
      if (recent.length >= count) {
        break;
      }
    }

    this.recentItems = recent;
    this.grouped = count > 0 && entries.length > count && recent.length > 0;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.grouped) {
      // Flat list — no section headers when there is nothing to disambiguate.
      return this.items;
    }
    if (!element) {
      return [
        new SectionItem("Recently Used", this.recentItems),
        new SectionItem("All", this.items),
      ];
    }
    if (element instanceof SectionItem) {
      return element.children;
    }
    return [];
  }
}
