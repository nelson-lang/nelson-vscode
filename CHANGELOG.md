# Change Log

All notable changes to the "nelson" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [3.4.0] - UNRELEASED

### Added

- MATLAB-style multiline comments with `%{` and `%}` in Nelson files.
- Nelson 1.17.0 language support for `arguments ... end` blocks.
- Completions and highlighting for new Nelson 1.17.0 functions and debugger commands.
- Snippets for input, output, optional, and name-value argument validation blocks.
- `Nelson: Select Runtime Path` command to configure the Nelson executable from a file picker.
- `Nelson: Run Selection in REPL` command for sending highlighted code to the Nelson terminal.
- `Nelson: Help` context menu command to show help for the symbol under the cursor.
- Context menu entries for running Nelson files and opening the Nelson REPL.
- Status bar entry for Nelson files with quick access to REPL and runtime setup actions.
- Direct documentation links and short debugger descriptions in Nelson completion items.
- Starter content for newly created Nelson documents.
- Native VS Code walkthrough for first-run setup.
- Explicit activation events for Nelson language and commands.

### Changed

- Dependencies updated.
- CI and local development Node.js runtime updated to Node 24.
- Renamed the REPL command to `Nelson: Open REPL` for clearer Command Palette discovery.
- Runtime setup errors now offer actions to open settings, select the executable, or open documentation.
- `Nelson: Run Active File` now shows progress while checking Nelson, saving files, and starting the REPL.

## [3.3.0] - 2025-11-23

### Added

- "Run Active File" button for `.m` files - executes the active file in Nelson REPL terminal
  - Automatically starts Nelson REPL if not running
  - Character-by-character sending to avoid terminal paste buffer issues with long paths
  - Version check: Requires Nelson >= 1.16.0
- New keywords for Nelson v1.15.0
- `nelson.runtimePath` setting to point VS Code directly at the Nelson executable
- Comprehensive unit tests with 35 passing tests covering all features
- CI integration

### Changed

- Completion provider now caches Nelson grammar data and triggers on identifier characters for faster, more relevant suggestions
- Nelson terminal command validates the configured/runtime paths before launching and surfaces clearer error messages
- `.prettierignore` prevents formatting generated assets
- Dependency list trimmed
- Terminal shell integration disabled for Nelson REPL to prevent input echo issues

### Fixed

- Long file paths in terminal commands no longer cause character duplication
- Terminal prompt handling improved with proper delays and command execution

## [3.2.1] - 2025-01-12

### Changed

- node dependencies regenerated/updated.

## [3.2.0] - 2025-01-12

### Added

- The NELSON_RUNTIME_PATH environment variable is now used to invoke Nelson. No additional configuration is required on Windows with version 1.11.0
- Package bundle included.

### Changed

- Keywords (macro, builtin) updated for 1.11.0 version.

## [3.1.0] - 2025-01-02

### Added

- Terminal profile with Nelson instance.
  Nelson executable path must be in your PATH environment variable.

## [3.0.0] - 2024-12-24

### Added

- Requires Nelson v1.10.0 as minimal version.
- Completion on macros and builtins of Nelson.
- Use Nelson's icon when a Nelson file is opened.
- Autocompletion for macros and built-in functions in Nelson.

### Changed

- Keywords (macro, builtin) updated for 1.10.0 version.
- Snippets updated.
- Dependencies updated for VS Code >= 1.96.

## [2.1.0] - 2021-06-17

### Added

- `.m` file extension managed (Nelson 0.5.6 or more).
- Keywords (macro, builtin) updated for 0.5.6 version.

## [2.0.0] - 2021-05-20

### Added

- Requires Nelson v0.5.5 as minimal version.
- Default comment symbol is '%'.
- Keywords (macro, builtin) updated for 0.5.5 version.

### Fixed

- Fix some warnings with last VS Code versions.

## [1.0.0] - 2020-01-01

### Added

- Initial public version.
