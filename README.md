# Nelson for Visual Studio Code 🚀

![Nelson-vscode](./images/Nelson-vscode.png)

This extension adds support for Nelson to VS Code, including Snippets and Syntax highlighting.

More information about [Nelson](https://github.com/Nelson-lang/nelson).

## Features ✨

### The extension provides Nelson features without installing the Nelson language

- Syntax highlighting 🎨

  ![syntax-highlight](./images/Syntax-highlight.png)

- Declarative language features:

  ![Auto-completion](./images/Code-completion.png)
  - Comments 💬
  - Brackets 🔧
  - Indentation rules 📏
  - Collapsible/folding 📂
  - Auto-completion ⚡

### Advanced Features requiring Nelson language installed

- Terminal profile 🖥️

  ![Nelson REPL](./images/Terminal-REPL.png)

  Make sure the path to the Nelson executable is added to either the PATH environment variable or the NELSON_RUNTIME_PATH environment variable. You can also set the `nelson.runtimePath` setting inside VS Code to point directly to the executable. On Windows, starting with version 1.11, NELSON_RUNTIME_PATH is automatically configured during installation.

## First run

1. Install Nelson from the [Nelson project](https://github.com/Nelson-lang/nelson).
2. If VS Code cannot find Nelson automatically, run `Nelson: Select Runtime Path` from the Command Palette and choose the Nelson executable.
3. Run `Nelson: Open REPL` to start an interactive Nelson terminal.
4. Open a `.m` file and use `Nelson: Run Active File` from the editor title button, Command Palette, or context menu.
5. Select a few lines and run `Nelson: Run Selection in REPL` to send just that code to the Nelson terminal.

When editing Nelson files, the status bar shows whether Nelson is using PATH or a configured runtime. Click it to open the REPL or update the runtime path.

## Known Issues 🐞

Feel free to consult and create bug or feature reports [here](https://github.com/nelson-lang/nelson-vscode/issues).

## Release Notes 📝

See [Changelog](https://github.com/nelson-lang/nelson-vscode/blob/master/CHANGELOG.md).

## Author 👤

Allan CORNET (<nelson.numerical.computation@gmail.com>)
