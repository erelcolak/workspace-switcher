<img width="128" height="128" alt="icon copy" src="https://github.com/user-attachments/assets/82d21738-9473-4290-bd9d-fa8fbd29a027" />

# Workspace Switcher

Scan your `.code-workspace` files and open them in one click from the **Activity Bar** and the **Status Bar**. Clicking an entry opens that workspace in a **new VSCode window** by default.

## Step 1: Pick Your Work/Root Folder

<img max-width="1280" max-height="720" alt="workspace-switcher" src="https://github.com/user-attachments/assets/094ce4af-26d3-4f57-ac9c-64440db5f710" />

## Step 2: Enjoy Your Workspaces

<img max-width="1280" max-height="720" alt="workspace-switcher" src="https://github.com/user-attachments/assets/0ff8f699-7ed8-4b5b-b148-c5c4198d34c9" />

## Getting started

Tell the extension where your workspaces live — no JSON editing required:

1. Open the **Workspaces** view from the Activity Bar.
2. Click the **gear icon** in the view title.
3. Choose **Add root folder...** and pick a folder in the dialog. Several folders can be selected at once.

The folder is saved to `workspaceSwitcher.rootFolders` and the list re-scans right away. Open the same panel again to remove a folder with its trash button.

## Features

- **Activity Bar panel** — A "Workspaces" view in the side bar lists every workspace found under your root folders. Click a row to open it in a new window; the `…` menu on the right of each row opens it in the current window or changes its colors.
- **Folder picker for root folders** — Click the gear icon in the _Workspaces_ view title to add a root folder through the native folder dialog, remove one with its trash button, or reveal it in the file manager. No hand-editing of `settings.json` required.
- **Status Bar button** — A `Workspaces` button in the Status Bar opens a Quick Pick to search and jump to any workspace.
- **Recently Used section** — When you have more workspaces than `lastUsedWorkspaceCount`, the list splits into **Recently Used** and **All**, so the workspaces you switch to most are always at the top.
- **Per-workspace colors** — Pick a background and foreground color via **Change Color of Workspace...** to tint the workspace's list icon, status bar and activity bar border; the colors are saved in its `.code-workspace` file.
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

### Colorize Workspaces

Hover a workspace in the list, open the `…` menu on the right (or right-click the row) and choose **Change Color of Workspace...**:

- **Background color** — pick a preset (the 900 shades of Vercel's Geist palette), use the color picker, or type a hex value.
- **Foreground color** — the status bar text color. **Auto** is on by default and picks white or dark text, whichever contrasts more with the background; turn it off to pick white or dark yourself, use the color picker, or type a hex value (the color already stored in the file is restored).
- **Apply to** — the background always tints the workspace's icon in the list. **Status bar** and **Activity bar active item border** are on by default; unchecked items are left unchanged in the file.

A live preview shows the result. **Apply** writes the colors to the `settings` block of that workspace's `.code-workspace` file; **Reset to Default** removes all of them. You can also set them by hand:

```jsonc
{
  "folders": [
    /* ... */
  ],
  "settings": {
    "workspaceSwitcher.iconColor": "#148d3e",
    "workbench.colorCustomizations": {
      "statusBar.background": "#148d3e",
      "statusBar.foreground": "#ffffff",
      "activityBar.activeBorder": "#148d3e",
    },
  },
}
```

Only the **icon** is tinted in the list — the name never changes. When no color is set, a theme-aware default layers icon is used. The picker only touches these settings; comments and formatting elsewhere in the file are preserved.

> **Themes:** workspace color customizations take precedence over your color theme. A theme-specific block such as `"[Theme Name]": { "statusBar.background": "…" }` inside `workbench.colorCustomizations` — in your User settings or in the workspace file — still overrides them while that theme is active. The picker shows a short warning only when such a block applies to the theme the workspace uses.

## Usage

- **Activity Bar:** Open the _Workspaces_ view from the side bar. Click a row to open it in a new window. The `…` menu on the right of a row offers **Open in Current Window** and **Change Color of Workspace...** (also available on right-click).
- **Status Bar:** Click the _Workspaces_ button to open a Quick Pick, then type to filter and press Enter to open.
- **Root folders:** Use the gear icon in the view title to add or remove the folders that are scanned.
- **Refresh:** Use the refresh icon in the view title to re-scan. The list also refreshes automatically when relevant settings change.

### Special Thanks

- [@seyitoztas](https://github.com/seyitoztas) - for adding root folder via using button
- [@osmnnl](https://github.com/osmnnl)
