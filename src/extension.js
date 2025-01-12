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
const fs = require("fs");
const path = require("path");
const languageCommands = require("./languageCommands");
const NelsonCompletionProvider = require("./completionProvider");
const NelsonTerminalProvider = require("./terminalProvider");
//=============================================================================
function activate(context) {
  const nelsonCompletionProvider =
    vscode.languages.registerCompletionItemProvider(
      { language: "nelson", scheme: "file" },
      new NelsonCompletionProvider(),
      ".",
    );

  const nelsonNewFileDocumentProvider = vscode.commands.registerCommand(
    "nelson.newFileDocument",
    languageCommands.newFileDocument,
  );

  const terminalProvider = new NelsonTerminalProvider();
  const terminalSubscriptions = terminalProvider.registerTerminalProvider();

  context.subscriptions.push(
    nelsonCompletionProvider,
    nelsonNewFileDocumentProvider,
    ...terminalSubscriptions,
  );
}
//=============================================================================
function deactivate() {}
//=============================================================================
module.exports = {
  activate,
  deactivate,
};
//=============================================================================
