# Change Log

All notable changes to the **Workspace Switcher** extension are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-24

### Added

- **Root folder picker** — Manage the scanned folders without touching `settings.json`. A gear icon in the _Workspaces_ view title opens a panel to add a root folder through the native folder dialog (multiple folders can be selected at once), remove one with its trash button, or click an entry to reveal it in the file manager.
- New command **Workspaces: Manage Root Folders...** (`workspaceSwitcher.manageRootFolders`), also available from the Command Palette.
- New command **Workspaces: Add Root Folder...** (`workspaceSwitcher.addRootFolder`).
- The empty-state view now offers an **Add Root Folder** link, so a fresh install is one click away from a populated list.
- Root folders that no longer exist on disk are flagged with a warning in the panel.

### Changed

- Paths inside the home directory are stored as `~/...`, keeping `workspaceSwitcher.rootFolders` portable across machines.
- Root folders are written to **User** settings, unless `workspaceSwitcher.rootFolders` is already defined in the current workspace — in that case the workspace value is updated instead.
- The list re-scans immediately after a root folder is added or removed.

### Thanks

- [@seyitoztas](https://github.com/seyitoztas) — for the add-root-folder button.
- [@osmnnl](https://github.com/osmnnl)

## [0.1.0] - 2026-06-18

### Added

- Initial release.
- **Activity Bar panel** — A _Workspaces_ view listing every `.code-workspace` file found under your root folders. Click a row to open it in a new window, or use the inline action to open it in the current window.
- **Status Bar button** — A `Workspaces` button opening a Quick Pick to search and jump to any workspace.
- **Recently Used section** — When the workspace count exceeds `workspaceSwitcher.lastUsedWorkspaceCount`, the list splits into **Recently Used** and **All**.
- **Per-workspace colored icons** — Tint a workspace's icon with any hex color via `workspaceSwitcher.iconColor` in its `.code-workspace` file.
- **Focused scanning** — `node_modules`, `dist`, `out`, `.next`, `target`, and `.git` are skipped automatically, symlinked directories are not followed, and `workspaceSwitcher.maxDepth` / `workspaceSwitcher.ignoreFolders` let you narrow the scan further.

[0.2.0]: https://github.com/erelcolak/workspace-switcher/releases/tag/v0.2.0
[0.1.0]: https://github.com/erelcolak/workspace-switcher/releases/tag/v0.1.0
