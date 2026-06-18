<img width="128" height="128" alt="icon copy" src="https://github.com/user-attachments/assets/82d21738-9473-4290-bd9d-fa8fbd29a027" />

# Workspace Switcher

Scan your `.code-workspace` files and open them in one click from the **Activity Bar** and the **Status Bar**. Clicking an entry opens that workspace in a **new VSCode window** by default.

<img width="1280" height="720" alt="workspace-switcher" src="https://github.com/user-attachments/assets/0ff8f699-7ed8-4b5b-b148-c5c4198d34c9" />

## Features

- **Activity Bar panel** — A "Workspaces" view in the side bar lists every workspace found under your root folders. Click a row to open it in a new window; use the inline action to open it in the current window.
- **Status Bar button** — A `Workspaces` button in the Status Bar opens a Quick Pick to search and jump to any workspace.
- **Recently Used section** — When you have more workspaces than `lastUsedWorkspaceCount`, the list splits into **Recently Used** and **All**, so the workspaces you switch to most are always at the top.
- **Per-workspace colored icons** — Tint a workspace's icon with any hex color via a single setting in its `.code-workspace` file.
- **Focused scanning** — Only `.code-workspace` files are listed (including those inside git repositories). Folders like `node_modules`, `dist`, `out`, `.next`, `target`, and `.git` are skipped automatically, and symlinked directories are not followed.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `workspaceSwitcher.rootFolders` | `["~/Developer"]` | Root folders to scan. `~` expands to the home directory. |
| `workspaceSwitcher.maxDepth` | `4` | Maximum scan depth from each root folder. |
| `workspaceSwitcher.ignoreFolders` | `[]` | Additional folder names to skip during scanning. |
| `workspaceSwitcher.iconColor` | `""` | Hex color for this workspace's icon in the list. Usually set per-workspace in the `.code-workspace` file. |
| `workspaceSwitcher.lastUsedWorkspaceCount` | `3` | Number of recently opened workspaces shown under "Recently Used". When the total exceeds this value, the list splits into "Recently Used" and "All"; otherwise a single flat list is shown. Set to `0` to disable sectioning. |

### Per-workspace icon color

To give a workspace a colored icon in the list, add a hex color to the `settings` block of its `.code-workspace` file:

```jsonc
{
  "folders": [ /* ... */ ],
  "settings": {
    "workspaceSwitcher.iconColor": "#d173f1"
  }
}
```

Only the **icon** is tinted — the name never changes. When no color is set, a theme-aware default layers icon is used.

## Usage

- **Activity Bar:** Open the *Workspaces* view from the side bar. Click a row to open it in a new window; use the inline action to open it in the current window.
- **Status Bar:** Click the *Workspaces* button to open a Quick Pick, then type to filter and press Enter to open.
- **Refresh:** Use the refresh icon in the view title to re-scan. The list also refreshes automatically when relevant settings change.
