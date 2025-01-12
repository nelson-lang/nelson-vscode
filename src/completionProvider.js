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
//=============================================================================
class NelsonCompletionProvider {
  provideCompletionItems(document, position, token, context) {
    const completions = [];
    try {
      // Check if the request has been canceled
      if (token.isCancellationRequested) {
        return [];
      }

      // Load language definition
      const tmLanguagePath = path.join(
        __dirname,
        "../syntaxes/nelson.tmLanguage.json",
      );
      const tmLanguage = JSON.parse(fs.readFileSync(tmLanguagePath, "utf8"));

      // Get the text up to the cursor position
      const linePrefix = document
        .lineAt(position)
        .text.substr(0, position.character);

      // Match the last word the user is typing
      const prefixMatch = linePrefix.match(/\b\w+$/);
      const prefix = prefixMatch ? prefixMatch[0].toLowerCase() : "";

      // Return no completions if no prefix is detected
      if (!prefix) {
        return [];
      }

      // Filter functions to match the prefix
      const filterFunctions = (functions, type) => {
        const filteredFuncs = functions.filter((func) =>
          func.toLowerCase().startsWith(prefix),
        );

        filteredFuncs.forEach((func) => {
          const completionItem = new vscode.CompletionItem(
            func,
            vscode.CompletionItemKind.Function,
          );
          completionItem.label = func;
          completionItem.detail = `${type} function in Nelson`;
          completionItem.insertText = new vscode.SnippetString(`${func}($1)`);
          // Adjust sort order: Builtin functions appear after Macro functions
          completionItem.sortText = `${type === "Builtin" ? "2" : "1"}_${func.toLowerCase()}`;
          completions.push(completionItem);
        });
      };

      // Extract and filter built-in functions
      const builtinFunctions = (
        tmLanguage.repository?.builtins?.patterns[0]?.match.match(/\b\w+\b/g) ||
        []
      ).filter((func) => func && typeof func === "string");
      filterFunctions(builtinFunctions, "Builtin");

      // Extract and filter macro functions
      const macroFunctions = (
        tmLanguage.repository?.macros?.patterns[0]?.match.match(/\b\w+\b/g) ||
        []
      ).filter((func) => func && typeof func === "string");
      filterFunctions(macroFunctions, "Macro");

      // Sort completions by priority and alphabetically
      completions.sort((a, b) => a.sortText.localeCompare(b.sortText));
    } catch (error) {
      console.error("Error providing completions:", error);
    }
    return completions;
  }
}
//=============================================================================
module.exports = NelsonCompletionProvider;
//=============================================================================
