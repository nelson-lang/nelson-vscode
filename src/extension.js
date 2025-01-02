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
//=============================================================================
function activate(context) {
  const nelsonCompletionProvider =
    vscode.languages.registerCompletionItemProvider(
      { language: "nelson", scheme: "file" },
      {
        provideCompletionItems(document, position, token, context) {
          const completions = [];

          const tmLanguagePath = path.join(
            __dirname,
            "../syntaxes/nelson.tmLanguage.json",
          );
          const tmLanguage = JSON.parse(
            fs.readFileSync(tmLanguagePath, "utf8"),
          );

          const builtinFunctions =
            tmLanguage.repository.builtins.patterns[0].match.match(/\b\w+\b/g);
          builtinFunctions.forEach((func) => {
            const completionItem = new vscode.CompletionItem(
              func,
              vscode.CompletionItemKind.Function,
            );
            completionItem.label = func + " (Builtin)";
            completionItem.insertText = new vscode.SnippetString(`${func}`);
            completionItem.sortText = "entity.name.function.nelson";
            completions.push(completionItem);
          });

          const macroFunctions =
            tmLanguage.repository.macros.patterns[0].match.match(/\b\w+\b/g);
          macroFunctions.forEach((func) => {
            const completionItem = new vscode.CompletionItem(
              func,
              vscode.CompletionItemKind.Function,
            );
            completionItem.label = func + " (Macro)";
            completionItem.insertText = new vscode.SnippetString(`${func}`);
            completionItem.sortText = "entity.name.function.nelson";
            completions.push(completionItem);
          });

          return completions;
        },
      },
      ".",
    );

  const nelsonNewFileDocumentProvider = vscode.commands.registerCommand(
    "nelson.newFileDocument",
    languageCommands.newFileDocument,
  );

  const terminalProfileProvider = vscode.window.registerTerminalProfileProvider(
    "nelson.customTerminal",
    {
      provideTerminalProfile() {
        const isWindows = process.platform === "win32";

        return {
          shellPath: isWindows ? "nelson.bat" : "nelson",
          shellArgs: ["-adv-cli"],
          name: "Nelson REPL",
        };
      },
    },
  );
  let createTerminalCommand = vscode.commands.registerCommand(
    "nelson.createCustomTerminal",
    () => {
      const terminal = vscode.window.createTerminal({
        name: "Nelson REPL",
        profileName: "nelson.customTerminal",
      });
      terminal.show();
    },
  );

  context.subscriptions.push(nelsonCompletionProvider);
  context.subscriptions.push(nelsonNewFileDocumentProvider);
  context.subscriptions.push(terminalProfileProvider, createTerminalCommand);
}
//=============================================================================
function deactivate() {}
//=============================================================================
module.exports = {
  activate,
  deactivate,
};
//=============================================================================
