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
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const NelsonCompletionProvider = require("./completionProvider");
//=============================================================================
const NELSON_REPL_NAME = "Nelson REPL";
const NELSON_DOCS_URL =
  "https://github.com/nelson-lang/nelson-vscode#advanced-features-requiring-nelson-language-installed";
const OPEN_SETTINGS_ACTION = "Open Settings";
const SELECT_EXECUTABLE_ACTION = "Select Nelson Executable";
const OPEN_DOCS_ACTION = "Open Docs";
const OPEN_REPL_ACTION = "Open Nelson REPL";
//=============================================================================
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
//=============================================================================
class NelsonTerminalProvider {
  constructor() {
    this.terminalProfileProvider = null;
    this.createTerminalCommand = null;
    this.selectRuntimePathCommand = null;
    this.runActiveFileCommand = null;
    this.runSelectionCommand = null;
    this.statusBarActionCommand = null;
    this.showHelpCommand = null;
    this.nelsonTerminal = null;
    this.terminalReady = false;
    this.nelsonVersion = null;
  }

  getNelsonVersion(executable) {
    try {
      const output = execSync(`"${executable}" -cli --version`, {
        encoding: "utf8",
        timeout: 5000,
      });

      // Match the first three version numbers and ignore any additional segments
      // Examples:
      // "1.16.0"
      // "1.16.0.1234"
      const versionMatch = output.match(/(\d+)\.(\d+)\.(\d+)/);

      if (versionMatch) {
        return {
          major: parseInt(versionMatch[1]),
          minor: parseInt(versionMatch[2]),
          patch: parseInt(versionMatch[3]),
        };
      }
    } catch (_) {
      // Ignore and return null
    }

    return null;
  }

  isVersionSupported(version) {
    if (!version) return false;
    // Check if version >= 1.16
    return version.major > 1 || (version.major === 1 && version.minor >= 16);
  }

  resolveNelsonExecutable() {
    const isWindows = process.platform === "win32";
    const executableName = isWindows ? "nelson.bat" : "nelson";
    const configurationPath = (
      vscode.workspace.getConfiguration("nelson").get("runtimePath") || ""
    ).trim();
    const runtimePath = (process.env.NELSON_RUNTIME_PATH || "").trim();

    const expandCandidates = (basePath) => {
      if (!basePath) {
        return [];
      }

      const normalizedPath = path.normalize(basePath);
      const candidates = [normalizedPath];

      const normalizedLower = normalizedPath.toLowerCase();
      const executableLower = executableName.toLowerCase();

      if (!normalizedLower.endsWith(executableLower)) {
        candidates.push(path.join(normalizedPath, executableName));
      }

      return candidates;
    };

    const findExisting = (candidates) => {
      for (const candidate of candidates) {
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
          }
        } catch (error) {
          // Ignore filesystem errors and continue testing the next candidate
        }
      }
      return null;
    };

    if (configurationPath) {
      const configuredExecutable = findExisting(
        expandCandidates(configurationPath),
      );
      if (configuredExecutable) {
        return { executable: configuredExecutable };
      }

      return {
        error: `Unable to locate Nelson executable defined in settings: ${configurationPath}`,
      };
    }

    if (runtimePath) {
      const runtimeExecutable = findExisting(expandCandidates(runtimePath));
      if (runtimeExecutable) {
        return { executable: runtimeExecutable };
      }

      return {
        error: `Unable to locate Nelson executable defined in NELSON_RUNTIME_PATH: ${runtimePath}`,
      };
    }

    return { executable: executableName };
  }

  async showRuntimeResolutionError(error) {
    const action = await vscode.window.showErrorMessage(
      error,
      OPEN_SETTINGS_ACTION,
      SELECT_EXECUTABLE_ACTION,
      OPEN_DOCS_ACTION,
    );

    if (action === OPEN_SETTINGS_ACTION) {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "nelson.runtimePath",
      );
    } else if (action === SELECT_EXECUTABLE_ACTION) {
      await vscode.commands.executeCommand("nelson.selectRuntimePath");
    } else if (action === OPEN_DOCS_ACTION) {
      await vscode.env.openExternal(vscode.Uri.parse(NELSON_DOCS_URL));
    }
  }

  async selectRuntimePath() {
    const executableName =
      process.platform === "win32" ? "nelson.bat" : "nelson";
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Select Nelson Executable",
      filters:
        process.platform === "win32"
          ? { "Nelson executable": ["bat", "exe"], "All files": ["*"] }
          : undefined,
      title: "Select Nelson Executable",
    });

    if (!selected || selected.length === 0) {
      return;
    }

    const executablePath = selected[0].fsPath;
    if (
      !fs.existsSync(executablePath) ||
      !fs.statSync(executablePath).isFile()
    ) {
      vscode.window.showErrorMessage(
        `Selected path is not a file: ${executablePath}`,
      );
      return;
    }

    const selectedName = path.basename(executablePath).toLowerCase();
    if (
      selectedName !== executableName.toLowerCase() &&
      selectedName !== "nelson.exe"
    ) {
      const action = await vscode.window.showWarningMessage(
        `The selected file is named "${path.basename(
          executablePath,
        )}", not "${executableName}". Save it as the Nelson runtime path anyway?`,
        "Save Anyway",
      );

      if (action !== "Save Anyway") {
        return;
      }
    }

    await vscode.workspace
      .getConfiguration("nelson")
      .update("runtimePath", executablePath, vscode.ConfigurationTarget.Global);
    this.nelsonVersion = null;
    vscode.window.showInformationMessage(
      `Nelson runtime path set to: ${executablePath}`,
    );
  }

  async getDocumentToRun(resourceUri) {
    if (resourceUri?.fsPath) {
      const document = await vscode.workspace.openTextDocument(resourceUri);
      await vscode.window.showTextDocument(document);
      return document;
    }

    const editor = vscode.window.activeTextEditor;
    return editor ? editor.document : null;
  }

  async createAdvancedTerminal(executable, progress) {
    progress?.report({ message: "Starting Nelson REPL..." });
    const terminal = vscode.window.createTerminal({
      name: NELSON_REPL_NAME,
      shellPath: executable,
      shellArgs: ["-adv-cli"],
      env: {
        NELSON_RUNTIME_PATH: process.env.NELSON_RUNTIME_PATH || "",
        VSCODE_SHELL_INTEGRATION: "0",
      },
    });
    this.nelsonTerminal = terminal;
    this.terminalReady = false;
    terminal.show();
    await delay(3000);
    this.terminalReady = true;
    return { terminal, isNewTerminal: true };
  }

  async findOrCreateAdvancedTerminal(executable, progress) {
    let terminal = this.findNelsonTerminal();
    if (!terminal) {
      return this.createAdvancedTerminal(executable, progress);
    }

    progress?.report({ message: "Reusing Nelson REPL..." });
    terminal.show();
    await delay(200);
    return { terminal, isNewTerminal: false };
  }

  async sendTextToTerminal(terminal, text, isNewTerminal) {
    await delay(isNewTerminal ? 500 : 100);

    for (const char of text) {
      terminal.sendText(char, false);
      await delay(2);
    }
  }

  async runSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active Nelson editor.");
      return;
    }

    const document = editor.document;
    if (document.languageId !== "nelson" && !document.fileName.endsWith(".m")) {
      vscode.window.showWarningMessage(
        "Active editor is not a Nelson (.m) file.",
      );
      return;
    }

    const selectedText = editor.selections
      .map((selection) => document.getText(selection).trim())
      .filter(Boolean)
      .join("\n");

    if (!selectedText) {
      vscode.window.showWarningMessage("Select Nelson code to run.");
      return;
    }

    const { executable, error } = this.resolveNelsonExecutable();
    if (error) {
      await this.showRuntimeResolutionError(error);
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Running Nelson selection",
        cancellable: false,
      },
      async (progress) => {
        const { terminal, isNewTerminal } =
          await this.findOrCreateAdvancedTerminal(executable, progress);
        progress.report({ message: "Sending selected code..." });
        await this.sendTextToTerminal(
          terminal,
          `${selectedText.replace(/\r\n/g, "\n")}\r`,
          isNewTerminal,
        );
      },
    );
  }

  async statusBarAction() {
    const { error } = this.resolveNelsonExecutable();
    if (error) {
      await this.showRuntimeResolutionError(error);
      return;
    }

    const action = await vscode.window.showQuickPick(
      [OPEN_REPL_ACTION, SELECT_EXECUTABLE_ACTION],
      {
        placeHolder: "Choose a Nelson action",
      },
    );

    if (action === OPEN_REPL_ACTION) {
      await vscode.commands.executeCommand("nelson.createCustomTerminal");
    } else if (action === SELECT_EXECUTABLE_ACTION) {
      await vscode.commands.executeCommand("nelson.selectRuntimePath");
    }
  }

  getActiveSymbol() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    const range = editor.document.getWordRangeAtPosition(
      editor.selection.active,
    );
    return range ? editor.document.getText(range) : null;
  }

  async showHelpForCurrentSymbol() {
    const symbol = this.getActiveSymbol();
    if (!symbol) {
      vscode.window.showWarningMessage("No Nelson symbol under the cursor.");
      return;
    }

    const { executable, error } = this.resolveNelsonExecutable();
    if (error) {
      await this.showRuntimeResolutionError(error);
      return;
    }

    const output = vscode.window.createOutputChannel("Nelson Help");
    output.clear();
    output.show(true);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading Nelson help: ${symbol}`,
        cancellable: false,
      },
      async () => {
        const rawHelpOutput =
          await NelsonCompletionProvider.loadNelsonHelpOutput(
            executable,
            symbol,
          );
        const helpText = NelsonCompletionProvider.normalizeHelpText(
          symbol,
          rawHelpOutput,
        );

        output.appendLine(helpText || `No Nelson help found for "${symbol}".`);
      },
    );
  }

  registerTerminalProvider() {
    this.terminalProfileProvider =
      vscode.window.registerTerminalProfileProvider("nelson.customTerminal", {
        provideTerminalProfile: () => {
          try {
            const { executable, error } = this.resolveNelsonExecutable();

            if (error) {
              this.showRuntimeResolutionError(error);
              return null;
            }

            return {
              shellPath: executable,
              shellArgs: ["-cli"],
              name: NELSON_REPL_NAME,
              env: {
                NELSON_RUNTIME_PATH: process.env.NELSON_RUNTIME_PATH || "",
                VSCODE_SHELL_INTEGRATION: "0",
              },
            };
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to create Nelson terminal: ${error.message}`,
            );
            return null;
          }
        },
      });

    this.createTerminalCommand = vscode.commands.registerCommand(
      "nelson.createCustomTerminal",
      async () => {
        try {
          const { error } = this.resolveNelsonExecutable();

          if (error) {
            await this.showRuntimeResolutionError(error);
            return;
          }

          const terminal = vscode.window.createTerminal({
            name: NELSON_REPL_NAME,
            profileName: "nelson.customTerminal",
          });
          this.nelsonTerminal = terminal;
          terminal.show();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create Nelson terminal: ${error.message}`,
          );
        }
      },
    );

    this.selectRuntimePathCommand = vscode.commands.registerCommand(
      "nelson.selectRuntimePath",
      () => this.selectRuntimePath(),
    );

    this.runActiveFileCommand = vscode.commands.registerCommand(
      "nelson.runActiveFile",
      async (resourceUri) => {
        try {
          const document = await this.getDocumentToRun(resourceUri);
          if (!document) {
            vscode.window.showWarningMessage("No active file to run.");
            return;
          }

          if (!document.fileName.endsWith(".m")) {
            vscode.window.showWarningMessage(
              "Active file is not a Nelson (.m) file.",
            );
            return;
          }

          // Check Nelson version
          const { executable, error } = this.resolveNelsonExecutable();
          if (error) {
            await this.showRuntimeResolutionError(error);
            return;
          }

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Running Nelson file",
              cancellable: false,
            },
            async (progress) => {
              progress.report({ message: "Checking Nelson version..." });
              if (!this.nelsonVersion) {
                this.nelsonVersion = this.getNelsonVersion(executable);
              }

              if (!this.isVersionSupported(this.nelsonVersion)) {
                vscode.window.showErrorMessage(
                  "Run Active File requires Nelson version 1.16 or higher. Please update your Nelson installation.",
                );
                return;
              }

              if (document.isUntitled || document.isDirty) {
                progress.report({ message: "Saving file..." });
                const saveResult = await document.save();
                if (!saveResult) {
                  vscode.window.showWarningMessage(
                    "Nelson file must be saved before it can be run.",
                  );
                  return;
                }
              }

              const { terminal, isNewTerminal } =
                await this.findOrCreateAdvancedTerminal(executable, progress);

              const normalizedPath = document.fileName.replace(/\\/g, "/");
              const command = `run('${normalizedPath}')\r`;

              progress.report({ message: "Sending run command..." });
              await this.sendTextToTerminal(terminal, command, isNewTerminal);
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to run file: ${error.message}`,
          );
        }
      },
    );

    this.runSelectionCommand = vscode.commands.registerCommand(
      "nelson.runSelection",
      () => this.runSelection(),
    );

    this.statusBarActionCommand = vscode.commands.registerCommand(
      "nelson.statusBarAction",
      () => this.statusBarAction(),
    );

    this.showHelpCommand = vscode.commands.registerCommand(
      "nelson.showHelp",
      () => this.showHelpForCurrentSymbol(),
    );

    // Listen for terminal close events to clean up reference
    vscode.window.onDidCloseTerminal((closedTerminal) => {
      if (
        this.nelsonTerminal &&
        closedTerminal.processId === this.nelsonTerminal.processId
      ) {
        this.nelsonTerminal = null;
        this.terminalReady = false;
      }
    });

    return [
      this.terminalProfileProvider,
      this.createTerminalCommand,
      this.selectRuntimePathCommand,
      this.runActiveFileCommand,
      this.runSelectionCommand,
      this.statusBarActionCommand,
      this.showHelpCommand,
    ];
  }

  findNelsonTerminal() {
    // Check if we have a stored reference and if it's still valid
    if (this.nelsonTerminal) {
      const allTerminals = vscode.window.terminals;
      if (allTerminals.includes(this.nelsonTerminal)) {
        return this.nelsonTerminal;
      }
      this.nelsonTerminal = null;
    }

    // Try to find an existing Nelson REPL terminal
    const terminals = vscode.window.terminals;
    for (const terminal of terminals) {
      if (terminal.name === NELSON_REPL_NAME) {
        this.nelsonTerminal = terminal;
        return terminal;
      }
    }

    return null;
  }
}
//=============================================================================
module.exports = NelsonTerminalProvider;
//=============================================================================
