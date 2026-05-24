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
//=============================================================================
const NEW_SCRIPT_TEMPLATE = [
  "% Nelson script",
  "% Add your commands below and run this file with Nelson: Run Active File.",
  "",
  "clear",
  "clc",
  "",
  "disp('Hello from Nelson')",
  "",
].join("\n");
//=============================================================================
async function newFileDocument() {
  vscode.workspace
    .openTextDocument({ language: "nelson", content: NEW_SCRIPT_TEMPLATE })
    .then((v) => vscode.window.showTextDocument(v));
}
//=============================================================================
module.exports = {
  NEW_SCRIPT_TEMPLATE,
  newFileDocument,
};
//=============================================================================
