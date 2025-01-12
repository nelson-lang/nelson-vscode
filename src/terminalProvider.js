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
//=============================================================================
class NelsonTerminalProvider {
  constructor() {
    this.terminalProfileProvider = null;
    this.createTerminalCommand = null;
  }

  getNelsonPath() {
    const runtimePath = process.env.NELSON_RUNTIME_PATH || "";
    const isWindows = process.platform === "win32";
    const executableName = isWindows ? "nelson.bat" : "nelson";
    if (runtimePath && fs.existsSync(runtimePath)) {
      return path.join(runtimePath, executableName);
    }
    return executableName;
  }

  registerTerminalProvider() {
    this.terminalProfileProvider =
      vscode.window.registerTerminalProfileProvider("nelson.customTerminal", {
        provideTerminalProfile: () => {
          try {
            const shellPath = this.getNelsonPath();

            return {
              shellPath,
              shellArgs: ["-adv-cli"],
              name: "Nelson REPL",
              env: {
                NELSON_RUNTIME_PATH: process.env.NELSON_RUNTIME_PATH || "",
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
          const terminal = vscode.window.createTerminal({
            name: "Nelson REPL",
            profileName: "nelson.customTerminal",
          });
          terminal.show();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create Nelson terminal: ${error.message}`,
          );
        }
      },
    );

    return [this.terminalProfileProvider, this.createTerminalCommand];
  }
}
//=============================================================================
module.exports = NelsonTerminalProvider;
//=============================================================================
