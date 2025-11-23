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
//=============================================================================
class NelsonTerminalProvider {
  constructor() {
    this.terminalProfileProvider = null;
    this.createTerminalCommand = null;
    this.runActiveFileCommand = null;
    this.nelsonTerminal = null;
    this.terminalReady = false;
    this.nelsonVersion = null;
  }

  getNelsonVersion(executable) {
    try {
      // Try to get version by running nelson with --version flag
      const output = execSync(`"${executable}" -cli --version`, {
        encoding: "utf8",
        timeout: 5000,
      });
      
      // Parse version from output (e.g., "1.16.0.1234")
      const versionMatch = output.match(/(\d+)\.(\d+)\.(\d+)/);
      if (versionMatch) {
        return {
          major: parseInt(versionMatch[1]),
          minor: parseInt(versionMatch[2]),
          patch: parseInt(versionMatch[3]),
        };
      }
    } catch (error) {
      // If version check fails, return null
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

  registerTerminalProvider() {
    this.terminalProfileProvider =
      vscode.window.registerTerminalProfileProvider("nelson.customTerminal", {
        provideTerminalProfile: () => {
          try {
            const { executable, error } = this.resolveNelsonExecutable();

            if (error) {
              vscode.window.showErrorMessage(error);
              return null;
            }

            return {
              shellPath: executable,
              shellArgs: ["-cli"],
              name: "Nelson REPL",
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
      () => {
        try {
          const { error } = this.resolveNelsonExecutable();

          if (error) {
            vscode.window.showErrorMessage(error);
            return;
          }

          const terminal = vscode.window.createTerminal({
            name: "Nelson REPL",
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

    this.runActiveFileCommand = vscode.commands.registerCommand(
      "nelson.runActiveFile",
      async () => {
        try {
          // Get the active text editor
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showWarningMessage("No active file to run.");
            return;
          }

          // Check if the file is a .m file
          const document = editor.document;
          if (!document.fileName.endsWith(".m")) {
            vscode.window.showWarningMessage(
              "Active file is not a Nelson (.m) file.",
            );
            return;
          }

          // Check Nelson version
          const { executable, error } = this.resolveNelsonExecutable();
          if (error) {
            vscode.window.showErrorMessage(error);
            return;
          }

          // Check version support
          if (!this.nelsonVersion) {
            this.nelsonVersion = this.getNelsonVersion(executable);
          }

          if (!this.isVersionSupported(this.nelsonVersion)) {
            vscode.window.showErrorMessage(
              "Run Active File requires Nelson version 1.16 or higher. Please update your Nelson installation.",
            );
            return;
          }

          // Check if the file is saved
          if (document.isUntitled || document.isDirty) {
            const saveResult = await document.save();
            if (!saveResult) {
              vscode.window.showWarningMessage(
                "File must be saved before running.",
              );
              return;
            }
          }

          // Find or create Nelson REPL terminal
          let terminal = this.findNelsonTerminal();
          let isNewTerminal = false;
          if (!terminal) {
            // Create a new Nelson REPL terminal
            terminal = vscode.window.createTerminal({
              name: "Nelson REPL",
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
            isNewTerminal = true;

            // Wait for terminal to initialize and show prompt
            // Poll for a reasonable time to let Nelson start
            await new Promise((resolve) => setTimeout(resolve, 3000));
            this.terminalReady = true;
          } else {
            terminal.show();
            // Give time for terminal to focus
            await new Promise((resolve) => setTimeout(resolve, 200));
          }

          // Get the file path
          const filePath = document.fileName;

          // Normalize the path for Nelson (use forward slashes)
          const normalizedPath = filePath.replace(/\\/g, "/");

          // Build the command
          const command = `run('${normalizedPath}')\r`;

          // Wait a bit more to ensure terminal is ready and at prompt
          if (isNewTerminal) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Send command character by character with 2ms delay to avoid duplication
          for (const char of command) {
            terminal.sendText(char, false);
            await new Promise((resolve) => setTimeout(resolve, 2));
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to run file: ${error.message}`,
          );
        }
      },
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
      this.runActiveFileCommand,
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
      if (terminal.name === "Nelson REPL") {
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
