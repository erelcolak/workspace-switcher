import * as vscode from "vscode";

/**
 * @function createStatusBar
 * @description Creates the status bar item that triggers the quick-switch picker.
 * @returns {vscode.StatusBarItem} The visible status bar item.
 */
export function createStatusBar(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  item.text = "$(layers) Workspace Switcher";
  item.tooltip = "Open the workspace list (quick switch)";
  item.command = "workspaceSwitcher.quickPick";
  item.show();
  return item;
}
