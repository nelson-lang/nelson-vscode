//=============================================================================
// Copyright (c) 2016-present Allan CORNET (Nelson)
//=============================================================================
// LICENCE_BLOCK_BEGIN
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
// LICENCE_BLOCK_END
//=============================================================================
const vscode = require("vscode");
const languageCommands = require("./languageCommands");
const NelsonCompletionProvider = require("./completionProvider");
const NelsonTerminalProvider = require("./terminalProvider");
//=============================================================================
const COMPLETION_TRIGGER_CHARACTERS = [
  ".",
  "(",
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  "_",
];
let activeCompletionProvider = null;
//=============================================================================
function isNelsonDocument(document) {
  return document?.languageId === "nelson" || document?.fileName.endsWith(".m");
}
//=============================================================================
function createNelsonStatusBarItem(context, terminalProvider) {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.command = "nelson.statusBarAction";

  const updateStatusBar = () => {
    const document = vscode.window.activeTextEditor?.document;
    if (!isNelsonDocument(document)) {
      statusBarItem.hide();
      return;
    }

    const { executable, error } = terminalProvider.resolveNelsonExecutable();
    statusBarItem.text = error
      ? "$(warning) Nelson: setup"
      : executable.includes("/") || executable.includes("\\")
        ? "$(terminal) Nelson: configured"
        : "$(terminal) Nelson: PATH";
    statusBarItem.tooltip = error
      ? `${error}\n\nClick to configure Nelson.`
      : `Using Nelson runtime: ${executable}\n\nClick for Nelson actions.`;
    statusBarItem.show();
  };

  context.subscriptions.push(
    statusBarItem,
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("nelson.runtimePath")) {
        updateStatusBar();
      }
    }),
  );

  updateStatusBar();
}
//=============================================================================
function activate(context) {
  const terminalProvider = new NelsonTerminalProvider();
  const completionProvider = new NelsonCompletionProvider({
    resolveNelsonExecutable: () => terminalProvider.resolveNelsonExecutable(),
  });
  activeCompletionProvider = completionProvider;
  const nelsonCompletionProvider =
    vscode.languages.registerCompletionItemProvider(
      { language: "nelson", scheme: "file" },
      completionProvider,
      ...COMPLETION_TRIGGER_CHARACTERS,
    );

  const nelsonNewFileDocumentProvider = vscode.commands.registerCommand(
    "nelson.newFileDocument",
    languageCommands.newFileDocument,
  );

  const terminalSubscriptions = terminalProvider.registerTerminalProvider();
  createNelsonStatusBarItem(context, terminalProvider);

  context.subscriptions.push(
    nelsonCompletionProvider,
    completionProvider,
    nelsonNewFileDocumentProvider,
    ...terminalSubscriptions,
  );
}
//=============================================================================
function deactivate() {
  activeCompletionProvider?.dispose?.();
  activeCompletionProvider = null;
}
//=============================================================================
module.exports = {
  activate,
  deactivate,
};
//=============================================================================
