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
const tmLanguagePath = path.join(
  __dirname,
  "../syntaxes/nelson.tmLanguage.json",
);

let functionCache = null;

try {
  fs.watch(tmLanguagePath, { persistent: false }, () => {
    functionCache = null;
  });
} catch (error) {
  console.error("Unable to watch Nelson grammar for changes:", error);
}

function parseFunctionList(section = {}) {
  const pattern = section.patterns?.[0]?.match;
  if (!pattern || typeof pattern !== "string") {
    return [];
  }
  return pattern.match(/\b\w+\b/g) || [];
}

function loadFunctionCache() {
  try {
    const tmLanguage = JSON.parse(fs.readFileSync(tmLanguagePath, "utf8"));
    functionCache = {
      builtin: parseFunctionList(tmLanguage.repository?.builtins),
      macro: parseFunctionList(tmLanguage.repository?.macros),
    };
  } catch (error) {
    console.error("Error loading Nelson grammar for completions:", error);
    functionCache = { builtin: [], macro: [] };
  }
}

function ensureFunctionCache() {
  if (!functionCache) {
    loadFunctionCache();
  }
  return functionCache;
}
//=============================================================================
class NelsonCompletionProvider {
  provideCompletionItems(document, position, token) {
    if (token.isCancellationRequested) {
      return [];
    }

    const linePrefix = document
      .lineAt(position)
      .text.slice(0, position.character);
    const prefixMatch = linePrefix.match(/\b\w+$/);
    const prefix = prefixMatch ? prefixMatch[0].toLowerCase() : "";

    if (!prefix) {
      return [];
    }

    const { builtin, macro } = ensureFunctionCache();
    const completions = [];

    const pushMatches = (symbols, type, sortPrefix) => {
      symbols
        .filter((symbol) => symbol.toLowerCase().startsWith(prefix))
        .forEach((symbol) => {
          const completionItem = new vscode.CompletionItem(
            symbol,
            vscode.CompletionItemKind.Function,
          );
          completionItem.detail = `${type} function in Nelson`;
          completionItem.sortText = `${sortPrefix}_${symbol.toLowerCase()}`;
          completions.push(completionItem);
        });
    };

    pushMatches(macro, "Macro", "1");
    pushMatches(builtin, "Builtin", "2");

    return completions;
  }
}
//=============================================================================
module.exports = NelsonCompletionProvider;
//=============================================================================
