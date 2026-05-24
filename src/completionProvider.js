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
const { spawn } = require("child_process");
//=============================================================================
const tmLanguagePath = path.join(
  __dirname,
  "../syntaxes/nelson.tmLanguage.json",
);

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

function getNelsonSpawnOptions() {
  return {
    detached: process.platform !== "win32",
    shell: false,
    windowsHide: true,
  };
}

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
    process.kill(-child.pid, "SIGTERM");
  } catch (_) {
    try {
      child.kill("SIGTERM");
    } catch (_) {
      // The process may already be gone.
    }
  }

  setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (_) {
      try {
        child.kill("SIGKILL");
      } catch (_) {
        // The process may already be gone.
      }
    }
  }, 500).unref?.();
}

let functionCache = null;

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
function normalizeHelpText(symbol, output) {
  const decodedOutput = decodeNelsonJsonHelpOutput(output) || output;
  const lines = decodedOutput
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^>>\s*/, "").trimEnd())
    .filter((line) => line.trim() !== "" && line.trim() !== `help ${symbol}`);

  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const helpStartPattern = new RegExp(`^\\s*${escapedSymbol}\\s+-\\s+`, "i");
  const helpStartIndex = lines.findIndex((line) => helpStartPattern.test(line));
  const helpLines = helpStartIndex >= 0 ? lines.slice(helpStartIndex) : lines;
  const normalized = helpLines.join("\n").trim();

  return normalized || null;
}
//=============================================================================
function decodeNelsonJsonHelpOutput(output) {
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
      // Try the next shape; Nelson may include prompts or labels.
    }
  }

  return null;
}
//=============================================================================
function resolveNelsonHelpExecutable(executable) {
  return path.normalize(executable.replace(/^['"]|['"]$/g, ""));
}
//=============================================================================
function getNelsonHelpProcess(executable, symbol) {
  const helpExecutable = resolveNelsonHelpExecutable(executable);
  const escapedSymbol = symbol.replace(/'/g, "''");
  const expression = `disp(jsonencode(help('${escapedSymbol}'))),quit`;
  const args = ["-adv-cli", "--quiet", "-e", expression];

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
      displayCommand: `${process.env.ComSpec || "cmd.exe"} /d /c call "${helpExecutable}" -adv-cli --quiet -e "disp(jsonencode(help('${symbol}'))),quit"`,
    };
  }

  return {
    command: helpExecutable,
    args,
    displayCommand: `${helpExecutable} -adv-cli --quiet -e "disp(jsonencode(help('${symbol}'))),quit"`,
  };
}
//=============================================================================
function getNelsonHelpSessionProcess(executable) {
  const helpExecutable = resolveNelsonHelpExecutable(executable);

  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/c", "call", helpExecutable, "-adv-cli", "--quiet"],
    };
  }

  return {
    command: helpExecutable,
    args: ["-adv-cli", "--quiet"],
  };
}
//=============================================================================
function loadNelsonHelpOutput(executable, symbol) {
  return new Promise((resolve) => {
    if (!/^\w+$/.test(symbol)) {
      resolve("");
      return;
    }

    let output = "";
    let settled = false;

    const { command, args } = getNelsonHelpProcess(executable, symbol);
    const child = spawn(command, args, getNelsonSpawnOptions());

    const finish = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(output);
      }
    };
    const timeout = setTimeout(() => {
      terminateProcessTree(child);
      finish();
    }, 7000);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", finish);
    child.on("close", finish);
  });
}
//=============================================================================
async function loadNelsonHelpText(executable, symbol) {
  const output = await loadNelsonHelpOutput(executable, symbol);
  return normalizeHelpText(symbol, output);
}
//=============================================================================
class NelsonHelpSession {
  constructor(executable) {
    this.executable = executable;
    this.child = null;
    this.buffer = "";
    this.queue = [];
    this.current = null;
    this.requestId = 0;
    this.disposed = false;
  }

  query(symbol) {
    if (this.disposed || !/^\w+$/.test(symbol)) {
      return Promise.resolve("");
    }

    return new Promise((resolve) => {
      this.queue.push({ symbol, resolve });
      this.processQueue();
    });
  }

  ensureChild() {
    if (this.disposed) {
      return null;
    }

    if (this.child && !this.child.killed) {
      return this.child;
    }

    const { command, args } = getNelsonHelpSessionProcess(this.executable);
    const child = spawn(command, args, getNelsonSpawnOptions());

    child.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString();
      this.tryCompleteCurrent();
    });
    child.stderr.on("data", (chunk) => {
      this.buffer += chunk.toString();
      this.tryCompleteCurrent();
    });
    child.on("error", () => this.closeCurrent(""));
    child.on("close", () => {
      this.child = null;
      this.closeCurrent("");
      while (this.queue.length) {
        this.queue.shift().resolve("");
      }
    });

    this.child = child;
    return child;
  }

  processQueue() {
    if (this.current || this.queue.length === 0) {
      return;
    }

    const child = this.ensureChild();
    if (!child?.stdin?.writable) {
      this.queue.shift().resolve("");
      return;
    }

    const request = this.queue.shift();
    const id = ++this.requestId;
    const begin = `__NELSON_HELP_BEGIN_${id}__`;
    const end = `__NELSON_HELP_END_${id}__`;
    const escapedSymbol = request.symbol.replace(/'/g, "''");
    this.current = {
      ...request,
      begin,
      end,
      timeout: setTimeout(() => {
        this.restart();
        request.resolve("");
        this.current = null;
        this.processQueue();
      }, 8000),
    };

    child.stdin.write(
      [
        `disp('${begin}')`,
        `disp(jsonencode(help('${escapedSymbol}')))`,
        `disp('${end}')`,
      ].join(",") + "\n",
    );
  }

  tryCompleteCurrent() {
    if (!this.current) {
      return;
    }

    const beginIndex = this.buffer.indexOf(this.current.begin);
    if (beginIndex < 0) {
      return;
    }

    const endIndex = this.buffer.indexOf(this.current.end, beginIndex);
    if (endIndex < 0) {
      return;
    }

    const output = this.buffer
      .slice(beginIndex + this.current.begin.length, endIndex)
      .replace(/^.*?>>\s*/s, "")
      .trim();
    this.buffer = this.buffer.slice(endIndex + this.current.end.length);
    this.closeCurrent(output);
    this.processQueue();
  }

  closeCurrent(output) {
    if (!this.current) {
      return;
    }

    clearTimeout(this.current.timeout);
    const current = this.current;
    this.current = null;
    current.resolve(output);
  }

  restart() {
    if (this.child) {
      if (this.child.stdin?.writable) {
        try {
          this.child.stdin.write("quit('force')\n");
          this.child.stdin.end();
        } catch (_) {
          // The process may already be gone.
        }
      }

      terminateProcessTree(this.child);
    }
    this.child = null;
    this.buffer = "";
  }

  dispose() {
    this.disposed = true;
    this.closeCurrent("");
    while (this.queue.length) {
      this.queue.shift().resolve("");
    }
    this.restart();
  }
}
//=============================================================================
class NelsonHelpLookup {
  constructor() {
    this.sessions = new Map();
  }

  getSession(executable) {
    const key = resolveNelsonHelpExecutable(executable);
    if (!this.sessions.has(key)) {
      this.sessions.set(key, new NelsonHelpSession(key));
    }
    return this.sessions.get(key);
  }

  async loadHelpOutput(executable, symbol) {
    const sessionOutput = await this.getSession(executable).query(symbol);
    if (sessionOutput) {
      return sessionOutput;
    }

    return loadNelsonHelpOutput(executable, symbol);
  }

  async loadHelpText(executable, symbol) {
    const output = await this.loadHelpOutput(executable, symbol);
    return normalizeHelpText(symbol, output);
  }

  dispose() {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }
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
NelsonCompletionProvider.NelsonHelpSession = NelsonHelpSession;
NelsonCompletionProvider.resolveNelsonHelpExecutable =
  resolveNelsonHelpExecutable;
NelsonCompletionProvider.normalizeHelpText = normalizeHelpText;
NelsonCompletionProvider.decodeNelsonJsonHelpOutput =
  decodeNelsonJsonHelpOutput;
//=============================================================================
module.exports = NelsonCompletionProvider;
//=============================================================================
