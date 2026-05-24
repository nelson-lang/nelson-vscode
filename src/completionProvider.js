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
const { execFile, spawn } = require("child_process");
//=============================================================================
const tmLanguagePath = path.join(
  __dirname,
  "../syntaxes/nelson.tmLanguage.json",
);
const HELP_MODULE_NAME = "help_tools";
const FALLBACK_HELP_LANGUAGE = "en_US";

const DEBUGGER_COMMANDS = new Set([
  "dbclear",
  "dbcont",
  "dbdown",
  "dbquit",
  "dbstatus",
  "dbstep",
  "dbstop",
  "dbup",
]);
const DEBUGGER_DOCUMENTATION = {
  dbclear: "Clear breakpoints in Nelson code.",
  dbcont: "Resume execution after stopping in the debugger.",
  dbdown: "Move down one level in the debugger call stack.",
  dbquit: "Quit debug mode and return to the prompt.",
  dbstatus: "List currently configured breakpoints.",
  dbstep: "Step through Nelson code while debugging.",
  dbstop: "Set a breakpoint in Nelson code.",
  dbup: "Move up one level in the debugger call stack.",
};
const MAX_HELP_PREFETCH_ITEMS = 8;
const HELP_PREFETCH_WAIT_MS = 150;
const HELP_MODULE_PATH_TIMEOUT_MS = 5000;

let functionCache = null;
let helpJsonCache = new Map();
let helpModulePathCache = new Map();

try {
  fs.watch(tmLanguagePath, { persistent: false }, () => {
    functionCache = null;
  });
} catch (error) {
  console.error("Unable to watch Nelson grammar for changes:", error);
}

function parseFunctionList(section = {}) {
  if (!Array.isArray(section.patterns)) {
    return [];
  }

  return section.patterns.flatMap((pattern) => {
    if (!pattern.match || typeof pattern.match !== "string") {
      return [];
    }
    return pattern.match.match(/\b\w+\b/g) || [];
  });
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
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
//=============================================================================
function isPathLike(executable) {
  return (
    path.isAbsolute(executable) ||
    executable.includes(path.sep) ||
    (path.sep !== "/" && executable.includes("/"))
  );
}
//=============================================================================
function resolveExecutableFromPath(executable) {
  if (!executable || isPathLike(executable)) {
    return executable;
  }

  const pathEntries = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
      : [""];
  const executableLower = executable.toLowerCase();
  const alreadyHasExtension =
    process.platform !== "win32" ||
    extensions.some((extension) =>
      executableLower.endsWith(extension.toLowerCase()),
    );

  for (const pathEntry of pathEntries) {
    const candidates = alreadyHasExtension
      ? [path.join(pathEntry, executable)]
      : extensions.map((extension) =>
          path.join(pathEntry, executable + extension),
        );

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch (_) {
        // Ignore invalid PATH entries.
      }
    }
  }

  return executable;
}
//=============================================================================
function resolveNelsonHelpExecutable(executable) {
  const normalized = String(executable || "").replace(/^['"]|['"]$/g, "");
  return path.normalize(resolveExecutableFromPath(normalized));
}
//=============================================================================
function terminateProcessTree(child) {
  if (!child?.pid) {
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
    });
    killer.on("error", () => {});
    killer.unref?.();
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch (_) {
    // The process may already be gone.
  }
}
//=============================================================================
function getNelsonModulePathProcess(executable) {
  const helpExecutable = resolveNelsonHelpExecutable(executable);
  const expression = `disp(jsonencode(modulepath('${HELP_MODULE_NAME}'))),quit`;

  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: [
        "/d",
        "/c",
        "call",
        helpExecutable,
        "-adv-cli",
        "--quiet",
        "-e",
        expression,
      ],
    };
  }

  return {
    command: helpExecutable,
    args: ["-adv-cli", "--quiet", "-e", expression],
  };
}
//=============================================================================
function decodeNelsonJsonStringOutput(output) {
  if (!output) {
    return null;
  }

  const normalizedOutput = output.replace(/\r\n/g, "\n").trim();
  const candidates = [
    normalizedOutput,
    ...normalizedOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  ];

  const firstQuote = normalizedOutput.indexOf('"');
  const lastQuote = normalizedOutput.lastIndexOf('"');
  if (firstQuote >= 0 && lastQuote > firstQuote) {
    candidates.push(normalizedOutput.slice(firstQuote, lastQuote + 1));
  }

  for (const candidate of candidates) {
    try {
      const decoded = JSON.parse(candidate);
      if (typeof decoded === "string") {
        return decoded;
      }
    } catch (_) {
      // Try the next output shape.
    }
  }

  return null;
}
//=============================================================================
function loadNelsonHelpModulePath(executable) {
  const helpExecutable = resolveNelsonHelpExecutable(executable);
  if (!helpExecutable) {
    return Promise.resolve(null);
  }

  if (helpModulePathCache.has(helpExecutable)) {
    return helpModulePathCache.get(helpExecutable);
  }

  const helpModulePathPromise = new Promise((resolve) => {
    const { command, args } = getNelsonModulePathProcess(helpExecutable);
    let settled = false;
    let child = null;
    const finish = (modulePath) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(modulePath);
    };
    const timeout = setTimeout(() => {
      terminateProcessTree(child);
      finish(null);
    }, HELP_MODULE_PATH_TIMEOUT_MS);

    child = execFile(
      command,
      args,
      {
        encoding: "utf8",
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          finish(null);
          return;
        }

        const modulePath = decodeNelsonJsonStringOutput(
          `${stdout || ""}\n${stderr || ""}`,
        );
        finish(modulePath ? path.normalize(modulePath) : null);
      },
    );
  });

  helpModulePathCache.set(helpExecutable, helpModulePathPromise);
  return helpModulePathPromise;
}
//=============================================================================
function findNelsonHelpModulePathFromExecutable(executable) {
  const normalizedExecutable = resolveNelsonHelpExecutable(executable);
  if (!normalizedExecutable) {
    return null;
  }

  let current = normalizedExecutable;
  try {
    if (fs.existsSync(current) && fs.statSync(current).isFile()) {
      current = path.dirname(current);
    }
  } catch (_) {
    current = path.dirname(current);
  }

  for (let depth = 0; depth < 8; depth += 1) {
    const helpModulePath = path.join(current, "modules", HELP_MODULE_NAME);
    if (fs.existsSync(path.join(helpModulePath, "help"))) {
      return helpModulePath;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}
//=============================================================================
function normalizeHelpLanguage(language) {
  if (!language || typeof language !== "string") {
    return null;
  }

  const normalized = language
    .split(".")[0]
    .replace("-", "_")
    .replace(/^([a-z]{2})_([a-z]{2})$/i, (_, code, region) => {
      return `${code.toLowerCase()}_${region.toUpperCase()}`;
    });

  if (/^[a-z]{2}$/i.test(normalized)) {
    const languageMap = {
      en: "en_US",
      fr: "fr_FR",
    };
    return languageMap[normalized.toLowerCase()] || null;
  }

  return /^[a-z]{2}_[A-Z]{2}$/.test(normalized) ? normalized : null;
}
//=============================================================================
function getHelpLanguageCandidates() {
  const candidates = [
    normalizeHelpLanguage(vscode.env?.language),
    normalizeHelpLanguage(process.env.LANG),
    FALLBACK_HELP_LANGUAGE,
  ].filter(Boolean);

  return [...new Set(candidates)];
}
//=============================================================================
async function findNelsonHelpJsonPath(executable) {
  const helpModulePaths = [];
  const helpModulePath = await loadNelsonHelpModulePath(executable);
  if (helpModulePath) {
    helpModulePaths.push(helpModulePath);
  }

  const fallbackHelpModulePath =
    findNelsonHelpModulePathFromExecutable(executable);
  if (
    fallbackHelpModulePath &&
    !helpModulePaths.includes(fallbackHelpModulePath)
  ) {
    helpModulePaths.push(fallbackHelpModulePath);
  }

  for (const candidateHelpModulePath of helpModulePaths) {
    const helpDirectory = path.join(candidateHelpModulePath, "help");
    for (const language of getHelpLanguageCandidates()) {
      const helpJsonPath = path.join(
        helpDirectory,
        `nelson_help_${language}.json`,
      );
      if (fs.existsSync(helpJsonPath)) {
        return helpJsonPath;
      }
    }
  }

  return null;
}
//=============================================================================
async function loadNelsonHelpJson(executable) {
  const helpJsonPath = await findNelsonHelpJsonPath(executable);
  if (!helpJsonPath) {
    return null;
  }

  if (helpJsonCache.has(helpJsonPath)) {
    return helpJsonCache.get(helpJsonPath);
  }

  try {
    const helpJson = JSON.parse(fs.readFileSync(helpJsonPath, "utf8"));
    helpJsonCache.set(helpJsonPath, helpJson);
    return helpJson;
  } catch (error) {
    console.error("Error loading Nelson help JSON:", error);
    helpJsonCache.set(helpJsonPath, null);
    return null;
  }
}
//=============================================================================
function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}
//=============================================================================
function appendArgumentSection(lines, title, value) {
  const argumentsList = toArray(value);
  if (argumentsList.length === 0) {
    return;
  }

  lines.push("", `${title}:`);
  for (const argument of argumentsList) {
    if (typeof argument === "string") {
      lines.push(`   ${argument}`);
      continue;
    }

    const name = argument?.name;
    const description = argument?.description;
    if (name && description) {
      lines.push(`   ${name}: ${description}`);
    } else if (name) {
      lines.push(`   ${name}`);
    } else if (description) {
      lines.push(`   ${description}`);
    }
  }
}
//=============================================================================
function formatNelsonJsonHelpEntry(symbol, entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const keyword = entry.keyword || symbol;
  const lines = [];
  if (entry.short_description) {
    lines.push(`${keyword} - ${entry.short_description}`);
  } else {
    lines.push(keyword);
  }

  if (entry.description) {
    lines.push("", `   ${entry.description}`);
  }

  const syntax = toArray(entry.syntax);
  if (syntax.length) {
    lines.push("", "   Syntax:");
    for (const syntaxLine of syntax) {
      lines.push(`      ${syntaxLine}`);
    }
  }

  appendArgumentSection(lines, "   Input Arguments", entry.input_arguments);
  appendArgumentSection(lines, "   Output Arguments", entry.output_arguments);

  const seeAlso = toArray(entry.see_also);
  if (seeAlso.length) {
    lines.push("", `   See also: ${seeAlso.join(", ")}`);
  }

  lines.push("", `   Documentation: ${keyword}`);

  return lines.join("\n").trim();
}
//=============================================================================
function findHelpEntry(helpJson, symbol) {
  if (!helpJson || !symbol) {
    return null;
  }

  if (helpJson[symbol]) {
    return helpJson[symbol];
  }

  const lowerSymbol = symbol.toLowerCase();
  const key = Object.keys(helpJson).find(
    (candidate) => candidate.toLowerCase() === lowerSymbol,
  );
  return key ? helpJson[key] : null;
}
//=============================================================================
async function loadNelsonHelpText(executable, symbol) {
  if (!/^\w+$/.test(symbol)) {
    return null;
  }

  const helpJson = await loadNelsonHelpJson(executable);
  const entry = findHelpEntry(helpJson, symbol);
  return formatNelsonJsonHelpEntry(symbol, entry);
}
//=============================================================================
async function loadNelsonHelpOutput(executable, symbol) {
  return loadNelsonHelpText(executable, symbol);
}
//=============================================================================
function normalizeHelpText(symbol, output) {
  if (!output || typeof output !== "string") {
    return null;
  }

  const normalized = output.replace(/\r\n/g, "\n").trim();
  return normalized || null;
}
//=============================================================================
class NelsonHelpLookup {
  async loadHelpText(executable, symbol) {
    return loadNelsonHelpText(executable, symbol);
  }

  async loadHelpOutput(executable, symbol) {
    return loadNelsonHelpOutput(executable, symbol);
  }

  dispose() {}
}
//=============================================================================
class NelsonCompletionProvider {
  constructor(options = {}) {
    this.resolveNelsonExecutable = options.resolveNelsonExecutable;
    this.helpLookup = options.helpLookup || new NelsonHelpLookup();
    this.loadHelpText =
      options.loadHelpText ||
      ((executable, symbol) =>
        this.helpLookup.loadHelpText(executable, symbol));
    this.helpCache = new Map();
    this.pendingHelp = new Map();
  }

  createDocumentation(symbol, itemType, helpText) {
    if (!helpText) {
      return null;
    }

    const firstHelpLine = helpText.split("\n").find((line) => line.trim());
    const documentation = new vscode.MarkdownString(
      [`**${symbol}**`, "", "```text", helpText, "```", ""].join("\n"),
    );
    documentation.isTrusted = false;

    return {
      detail: firstHelpLine || `${itemType} in Nelson`,
      documentation,
    };
  }

  getCachedDocumentation(symbol, itemType) {
    return this.createDocumentation(
      symbol,
      itemType,
      this.helpCache.get(symbol),
    );
  }

  getOrLoadHelpText(symbol) {
    if (!this.resolveNelsonExecutable) {
      this.helpCache.set(symbol, null);
      return Promise.resolve(null);
    }

    if (this.helpCache.has(symbol)) {
      return Promise.resolve(this.helpCache.get(symbol));
    }

    if (this.pendingHelp.has(symbol)) {
      return this.pendingHelp.get(symbol);
    }

    const { executable, error } = this.resolveNelsonExecutable();
    if (error || !executable) {
      this.helpCache.set(symbol, null);
      return Promise.resolve(null);
    }

    const helpPromise = this.loadHelpText(executable, symbol)
      .then((helpText) => {
        this.helpCache.set(symbol, helpText);
        return helpText;
      })
      .catch(() => {
        this.helpCache.set(symbol, null);
        return null;
      })
      .finally(() => {
        this.pendingHelp.delete(symbol);
      });

    this.pendingHelp.set(symbol, helpPromise);
    return helpPromise;
  }

  warmNelsonHelpCache(symbol) {
    this.getOrLoadHelpText(symbol);
  }

  prefetchHelpForItems(items) {
    return Promise.allSettled(
      items
        .filter((item) => !item.documentation || item.nelsonHelpPending)
        .slice(0, MAX_HELP_PREFETCH_ITEMS)
        .map(async (item) => {
          const symbol = item.nelsonSymbol || item.label?.label || item.label;
          if (symbol) {
            const itemType =
              item.nelsonItemType ||
              (item.detail || "Function").replace(/\s+in Nelson.*$/, "");
            const helpText = await this.getOrLoadHelpText(symbol);
            const cachedDocumentation = this.createDocumentation(
              symbol,
              itemType,
              helpText,
            );
            if (cachedDocumentation) {
              item.detail = cachedDocumentation.detail;
              item.documentation = cachedDocumentation.documentation;
              item.nelsonHelpPending = false;
            } else if (item.nelsonHelpPending) {
              item.documentation = undefined;
              item.nelsonHelpPending = false;
            }
          }
        }),
    );
  }

  async resolveCompletionItem(completionItem, token) {
    if (
      token?.isCancellationRequested ||
      (completionItem.documentation && !completionItem.nelsonHelpPending)
    ) {
      return completionItem;
    }

    const symbol =
      completionItem.nelsonSymbol ||
      completionItem.label?.label ||
      completionItem.label;
    const itemType =
      completionItem.nelsonItemType ||
      (completionItem.detail || "Function").replace(/\s+in Nelson.*$/, "");

    if (!symbol) {
      return completionItem;
    }

    const helpText = await this.getOrLoadHelpText(symbol);
    if (token?.isCancellationRequested) {
      return completionItem;
    }

    const cachedDocumentation = this.createDocumentation(
      symbol,
      itemType,
      helpText,
    );
    if (cachedDocumentation) {
      completionItem.detail = cachedDocumentation.detail;
      completionItem.documentation = cachedDocumentation.documentation;
      completionItem.nelsonHelpPending = false;
    } else if (completionItem.nelsonHelpPending) {
      completionItem.documentation = undefined;
      completionItem.nelsonHelpPending = false;
    }

    return completionItem;
  }

  async provideCompletionItems(document, position, token) {
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
          const isDebuggerCommand = DEBUGGER_COMMANDS.has(symbol.toLowerCase());
          const completionItem = new vscode.CompletionItem(
            symbol,
            vscode.CompletionItemKind.Function,
          );
          const itemType = isDebuggerCommand
            ? "Debugger command"
            : `${type} function`;
          completionItem.detail = `${itemType} in Nelson`;
          completionItem.nelsonSymbol = symbol;
          completionItem.nelsonItemType = itemType;

          const cachedDocumentation = this.getCachedDocumentation(
            symbol,
            itemType,
          );
          if (cachedDocumentation) {
            completionItem.detail = cachedDocumentation.detail;
            completionItem.documentation = cachedDocumentation.documentation;
            completionItem.nelsonHelpPending = false;
          } else if (isDebuggerCommand) {
            completionItem.documentation =
              DEBUGGER_DOCUMENTATION[symbol.toLowerCase()];
          } else {
            completionItem.documentation = new vscode.MarkdownString(
              [`**${symbol}**`, "", "Loading Nelson help..."].join("\n"),
            );
            completionItem.documentation.isTrusted = false;
            completionItem.nelsonHelpPending = true;
          }

          completionItem.sortText = `${sortPrefix}_${symbol.toLowerCase()}`;
          completions.push(completionItem);
        });
    };

    pushMatches(macro, "Macro", "1");
    pushMatches(builtin, "Builtin", "2");
    await Promise.race([
      this.prefetchHelpForItems(completions),
      delay(HELP_PREFETCH_WAIT_MS),
    ]);

    return completions;
  }

  dispose() {
    this.helpLookup?.dispose?.();
  }
}
//=============================================================================
NelsonCompletionProvider.loadNelsonHelpText = loadNelsonHelpText;
NelsonCompletionProvider.loadNelsonHelpOutput = loadNelsonHelpOutput;
NelsonCompletionProvider.NelsonHelpLookup = NelsonHelpLookup;
NelsonCompletionProvider.resolveNelsonHelpExecutable =
  resolveNelsonHelpExecutable;
NelsonCompletionProvider.decodeNelsonJsonStringOutput =
  decodeNelsonJsonStringOutput;
NelsonCompletionProvider.loadNelsonHelpModulePath = loadNelsonHelpModulePath;
NelsonCompletionProvider.findNelsonHelpModulePathFromExecutable =
  findNelsonHelpModulePathFromExecutable;
NelsonCompletionProvider.findNelsonHelpJsonPath = findNelsonHelpJsonPath;
NelsonCompletionProvider.formatNelsonJsonHelpEntry = formatNelsonJsonHelpEntry;
NelsonCompletionProvider.normalizeHelpText = normalizeHelpText;
//=============================================================================
module.exports = NelsonCompletionProvider;
//=============================================================================
