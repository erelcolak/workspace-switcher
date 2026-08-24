<img width="128" height="128" alt="icon copy" src="https://github.com/user-attachments/assets/82d21738-9473-4290-bd9d-fa8fbd29a027" />

# Workspace Switcher

Scan your `.code-workspace` files and open them in one click from the **Activity Bar** and the **Status Bar**. Clicking an entry opens that workspace in a **new VSCode window** by default.

<img max-width="1280" max-height="720" alt="workspace-switcher" src="https://github.com/user-attachments/assets/0ff8f699-7ed8-4b5b-b148-c5c4198d34c9" />

<img max-width="1280" max-height="720" alt="workspace-switcher" src="https://github.com/user-attachments/assets/094ce4af-26d3-4f57-ac9c-64440db5f710" />

## Getting started

Tell the extension where your workspaces live — no JSON editing required:

1. Open the **Workspaces** view from the Activity Bar.
2. Click the **gear icon** in the view title.
3. Choose **Add root folder...** and pick a folder in the dialog. Several folders can be selected at once.

The folder is saved to `workspaceSwitcher.rootFolders` and the list re-scans right away. Open the same panel again to remove a folder with its trash button.

## Features

- **Activity Bar panel** — A "Workspaces" view in the side bar lists every workspace found under your root folders. Click a row to open it in a new window; use the inline action to open it in the current window.
- **Folder picker for root folders** — Click the gear icon in the _Workspaces_ view title to add a root folder through the native folder dialog, remove one with its trash button, or reveal it in the file manager. No hand-editing of `settings.json` required.
- **Status Bar button** — A `Workspaces` button in the Status Bar opens a Quick Pick to search and jump to any workspace.
- **Recently Used section** — When you have more workspaces than `lastUsedWorkspaceCount`, the list splits into **Recently Used** and **All**, so the workspaces you switch to most are always at the top.
- **Per-workspace colored icons** — Tint a workspace's icon with any hex color via a single setting in its `.code-workspace` file.
- **Focused scanning** — Only `.code-workspace` files are listed (including those inside git repositories). Folders like `node_modules`, `dist`, `out`, `.next`, `target`, and `.git` are skipped automatically, and symlinked directories are not followed.

## Configuration

| Setting                                    | Default           | Description                                                                                                                                                                                                                   |
| ------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceSwitcher.rootFolders`            | `["~/Developer"]` | Root folders to scan. `~` expands to the home directory. Easiest way to change it: the gear icon in the _Workspaces_ view.                                                                                                    |
| `workspaceSwitcher.maxDepth`               | `4`               | Maximum scan depth from each root folder.                                                                                                                                                                                     |
| `workspaceSwitcher.ignoreFolders`          | `[]`              | Additional folder names to skip during scanning.                                                                                                                                                                              |
| `workspaceSwitcher.iconColor`              | `""`              | Hex color for this workspace's icon in the list. Usually set per-workspace in the `.code-workspace` file.                                                                                                                     |
| `workspaceSwitcher.lastUsedWorkspaceCount` | `3`               | Number of recently opened workspaces shown under "Recently Used". When the total exceeds this value, the list splits into "Recently Used" and "All"; otherwise a single flat list is shown. Set to `0` to disable sectioning. |

### Root folders

The gear icon in the _Workspaces_ view (see [Getting started](#getting-started)) is the easiest way to manage this setting; **Workspaces: Manage Root Folders...** in the Command Palette opens the same panel. Clicking a folder in that panel reveals it in the file manager, and folders that no longer exist on disk are flagged.

Paths inside your home directory are stored as `~/...` so the setting stays portable. Root folders are saved to your **User** settings, unless `workspaceSwitcher.rootFolders` is already defined in the current workspace — in that case the workspace value is updated instead.

### Per-workspace icon color

To give a workspace a colored icon in the list, add a hex color to the `settings` block of its `.code-workspace` file:

```jsonc
{
  "folders": [
    /* ... */
  ],
  "settings": {
    "workspaceSwitcher.iconColor": "#d173f1",
  },
}
```

Only the **icon** is tinted — the name never changes. When no color is set, a theme-aware default layers icon is used.

## Usage

- **Activity Bar:** Open the _Workspaces_ view from the side bar. Click a row to open it in a new window; use the inline action to open it in the current window.
- **Status Bar:** Click the _Workspaces_ button to open a Quick Pick, then type to filter and press Enter to open.
- **Root folders:** Use the gear icon in the view title to add or remove the folders that are scanned.
- **Refresh:** Use the refresh icon in the view title to re-scan. The list also refreshes automatically when relevant settings change.

### Special Thanks

- [@seyitoztas](https://github.com/seyitoztas) - for adding root folder via using button
- [@osmnnl](https://github.com/osmnnl)
