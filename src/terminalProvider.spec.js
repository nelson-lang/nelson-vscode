const fs = require("fs");
const os = require("os");
const path = require("path");

const mockVscode = {
  ConfigurationTarget: {
    Global: "Global",
  },
  ProgressLocation: {
    Notification: "Notification",
  },
  Uri: {
    parse: jest.fn((value) => ({ value })),
  },
  env: {
    openExternal: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(),
    openTextDocument: jest.fn(),
  },
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showOpenDialog: jest.fn(),
    showQuickPick: jest.fn(),
    showTextDocument: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      clear: jest.fn(),
      show: jest.fn(),
      appendLine: jest.fn(),
    })),
    withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
    activeTextEditor: null,
    registerTerminalProfileProvider: jest.fn(),
    createTerminal: jest.fn(),
    onDidCloseTerminal: jest.fn(),
    terminals: [],
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
  },
};

jest.mock("vscode", () => mockVscode, { virtual: true });

describe("NelsonTerminalProvider", () => {
  let configuration;
  let TerminalProvider;
  let originalRuntimePath;
  let tempDir;
  let consoleErrorSpy;
  let stderrWriteSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Suppress console output during tests
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    stderrWriteSpy = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => {});

    originalRuntimePath = process.env.NELSON_RUNTIME_PATH;
    configuration = {
      get: jest.fn().mockReturnValue(""),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockVscode.workspace.getConfiguration.mockReturnValue(configuration);
    mockVscode.window.registerTerminalProfileProvider.mockReturnValue({
      dispose: jest.fn(),
    });
    mockVscode.window.createTerminal.mockReturnValue({
      name: "Nelson REPL",
      show: jest.fn(),
      sendText: jest.fn(),
      processId: 123,
    });
    mockVscode.commands.registerCommand.mockReturnValue({ dispose: jest.fn() });
    mockVscode.window.activeTextEditor = null;
    mockVscode.window.terminals = [];

    TerminalProvider = require("./terminalProvider");

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nelson-tests-"));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    stderrWriteSpy.mockRestore();

    if (originalRuntimePath === undefined) {
      delete process.env.NELSON_RUNTIME_PATH;
    } else {
      process.env.NELSON_RUNTIME_PATH = originalRuntimePath;
    }

    if (tempDir && fs.existsSync(tempDir)) {
      fs.readdirSync(tempDir).forEach((file) => {
        fs.unlinkSync(path.join(tempDir, file));
      });
      fs.rmdirSync(tempDir);
    }
  });

  it("uses the configured runtime path when available", () => {
    const executableName =
      process.platform === "win32" ? "nelson.bat" : "nelson";
    const executablePath = path.join(tempDir, executableName);
    fs.writeFileSync(executablePath, "echo test");

    configuration.get.mockImplementation((key) =>
      key === "runtimePath" ? executablePath : "",
    );

    const provider = new TerminalProvider();
    const result = provider.resolveNelsonExecutable();

    expect(result).toEqual({ executable: executablePath });
  });

  it("returns an error when the configured path does not exist", () => {
    configuration.get.mockImplementation((key) =>
      key === "runtimePath" ? path.join(tempDir, "missing.exe") : "",
    );

    const provider = new TerminalProvider();
    const result = provider.resolveNelsonExecutable();

    expect(result.error).toContain(
      "Unable to locate Nelson executable defined in settings",
    );
  });

  it("falls back to the NELSON_RUNTIME_PATH environment variable", () => {
    configuration.get.mockImplementation(() => "");

    const executableName =
      process.platform === "win32" ? "nelson.bat" : "nelson";
    const executablePath = path.join(tempDir, executableName);
    fs.writeFileSync(executablePath, "echo test");

    process.env.NELSON_RUNTIME_PATH = tempDir;

    const provider = new TerminalProvider();
    const result = provider.resolveNelsonExecutable();

    expect(result).toEqual({ executable: executablePath });
  });

  it("returns the executable name when no overrides are provided", () => {
    configuration.get.mockImplementation(() => "");
    delete process.env.NELSON_RUNTIME_PATH;

    const provider = new TerminalProvider();
    const result = provider.resolveNelsonExecutable();

    const expected = process.platform === "win32" ? "nelson.bat" : "nelson";
    expect(result).toEqual({ executable: expected });
  });

  it("registers terminal providers and commands", () => {
    const provider = new TerminalProvider();
    const registrations = provider.registerTerminalProvider();

    expect(
      mockVscode.window.registerTerminalProfileProvider,
    ).toHaveBeenCalledWith("nelson.customTerminal", expect.any(Object));
    expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
      "nelson.createCustomTerminal",
      expect.any(Function),
    );
    expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
      "nelson.selectRuntimePath",
      expect.any(Function),
    );
    expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
      "nelson.runActiveFile",
      expect.any(Function),
    );
    expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
      "nelson.runSelection",
      expect.any(Function),
    );
    expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
      "nelson.statusBarAction",
      expect.any(Function),
    );
    expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
      "nelson.showHelp",
      expect.any(Function),
    );
    expect(registrations).toHaveLength(7);
  });

  it("runs the active file workflow inside progress UI", async () => {
    const document = {
      fileName: path.join(tempDir, "script.m"),
      isUntitled: false,
      isDirty: false,
      save: jest.fn(),
    };
    mockVscode.window.activeTextEditor = { document };

    const provider = new TerminalProvider();
    provider.nelsonVersion = { major: 1, minor: 15, patch: 0 };
    provider.registerTerminalProvider();

    const runCommandCall = mockVscode.commands.registerCommand.mock.calls.find(
      ([command]) => command === "nelson.runActiveFile",
    );
    await runCommandCall[1]();

    expect(mockVscode.window.withProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        location: mockVscode.ProgressLocation.Notification,
        title: "Running Nelson file",
      }),
      expect.any(Function),
    );
    expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Run Active File requires Nelson version 1.16 or higher. Please update your Nelson installation.",
    );
  });

  it("runs selected Nelson code in the REPL", async () => {
    const terminal = {
      name: "Nelson REPL",
      show: jest.fn(),
      sendText: jest.fn(),
      processId: 456,
    };
    mockVscode.window.terminals = [terminal];
    mockVscode.window.activeTextEditor = {
      document: {
        fileName: path.join(tempDir, "script.m"),
        languageId: "nelson",
        getText: jest.fn(() => "disp('selection')"),
      },
      selections: [{}],
    };

    const provider = new TerminalProvider();
    provider.registerTerminalProvider();

    const runSelectionCall =
      mockVscode.commands.registerCommand.mock.calls.find(
        ([command]) => command === "nelson.runSelection",
      );
    await runSelectionCall[1]();

    expect(mockVscode.window.withProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Running Nelson selection",
      }),
      expect.any(Function),
    );
    expect(terminal.show).toHaveBeenCalled();
    expect(terminal.sendText).toHaveBeenCalled();
  });

  it("offers status bar actions", async () => {
    mockVscode.window.showQuickPick.mockResolvedValue("Open Nelson REPL");

    const provider = new TerminalProvider();
    await provider.statusBarAction();

    expect(mockVscode.window.showQuickPick).toHaveBeenCalledWith(
      ["Open Nelson REPL", "Select Nelson Executable"],
      { placeHolder: "Choose a Nelson action" },
    );
    expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
      "nelson.createCustomTerminal",
    );
  });

  it("shows Nelson help for the current symbol", async () => {
    mockVscode.window.activeTextEditor = {
      document: {
        getWordRangeAtPosition: jest.fn(() => ({ start: 0, end: 3 })),
        getText: jest.fn(() => "cos"),
      },
      selection: { active: {} },
    };

    const NelsonCompletionProvider = require("./completionProvider");
    jest
      .spyOn(NelsonCompletionProvider, "loadNelsonHelpOutput")
      .mockResolvedValue(
        '" cos - Computes the cosine in radians for each element of x.\\n"',
      );
    const outputChannel = {
      clear: jest.fn(),
      show: jest.fn(),
      appendLine: jest.fn(),
    };
    mockVscode.window.createOutputChannel.mockReturnValue(outputChannel);

    const provider = new TerminalProvider();
    provider.registerTerminalProvider();

    const showHelpCall = mockVscode.commands.registerCommand.mock.calls.find(
      ([command]) => command === "nelson.showHelp",
    );
    await showHelpCall[1]();

    expect(mockVscode.window.createOutputChannel).toHaveBeenCalledWith(
      "Nelson Help",
    );
    expect(outputChannel.appendLine).toHaveBeenCalledWith(
      "cos - Computes the cosine in radians for each element of x.",
    );
  });

  it("shows actionable options when the runtime path cannot be resolved", async () => {
    mockVscode.window.showErrorMessage.mockResolvedValue("Open Settings");

    const provider = new TerminalProvider();
    await provider.showRuntimeResolutionError("Missing Nelson");

    expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Missing Nelson",
      "Open Settings",
      "Select Nelson Executable",
      "Open Docs",
    );
    expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
      "workbench.action.openSettings",
      "nelson.runtimePath",
    );
  });

  it("saves the selected Nelson runtime path", async () => {
    const executableName =
      process.platform === "win32" ? "nelson.bat" : "nelson";
    const executablePath = path.join(tempDir, executableName);
    fs.writeFileSync(executablePath, "echo test");
    mockVscode.window.showOpenDialog.mockResolvedValue([
      { fsPath: executablePath },
    ]);

    const provider = new TerminalProvider();
    await provider.selectRuntimePath();

    expect(configuration.update).toHaveBeenCalledWith(
      "runtimePath",
      executablePath,
      mockVscode.ConfigurationTarget.Global,
    );
    expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
      `Nelson runtime path set to: ${executablePath}`,
    );
  });

  it("does not update the runtime path when selection is cancelled", async () => {
    mockVscode.window.showOpenDialog.mockResolvedValue(undefined);

    const provider = new TerminalProvider();
    await provider.selectRuntimePath();

    expect(configuration.update).not.toHaveBeenCalled();
  });

  describe("getNelsonVersion", () => {
    it("parses version from --version output", () => {
      // Mock execSync before creating provider
      const childProcess = require("child_process");
      const mockExec = jest.spyOn(childProcess, "execSync");
      mockExec.mockReturnValue("Nelson 1.16.0.1234\n");

      // Now reload the module with the mock in place
      jest.resetModules();
      const TerminalProviderWithMock = require("./terminalProvider");
      const provider = new TerminalProviderWithMock();

      const version = provider.getNelsonVersion("nelson");

      expect(version).toEqual({ major: 1, minor: 16, patch: 0 });
      expect(mockExec).toHaveBeenCalledWith(
        '"nelson" -cli --version',
        expect.objectContaining({
          encoding: "utf8",
          timeout: 5000,
        }),
      );
      mockExec.mockRestore();
    });

    it("returns null when version cannot be parsed", () => {
      const provider = new TerminalProvider();
      const mockExec = jest.spyOn(require("child_process"), "execSync");
      mockExec.mockReturnValue("Invalid output\n");

      const version = provider.getNelsonVersion("nelson");

      expect(version).toBeNull();
      mockExec.mockRestore();
    });

    it("returns null when execSync throws an error", () => {
      const provider = new TerminalProvider();
      const mockExec = jest.spyOn(require("child_process"), "execSync");
      mockExec.mockImplementation(() => {
        throw new Error("Command failed");
      });

      const version = provider.getNelsonVersion("nelson");

      expect(version).toBeNull();
      mockExec.mockRestore();
    });
  });

  describe("isVersionSupported", () => {
    it("returns true for version 1.16.0", () => {
      const provider = new TerminalProvider();
      const result = provider.isVersionSupported({
        major: 1,
        minor: 16,
        patch: 0,
      });
      expect(result).toBe(true);
    });

    it("returns true for version 1.17.0", () => {
      const provider = new TerminalProvider();
      const result = provider.isVersionSupported({
        major: 1,
        minor: 17,
        patch: 0,
      });
      expect(result).toBe(true);
    });

    it("returns true for version 2.0.0", () => {
      const provider = new TerminalProvider();
      const result = provider.isVersionSupported({
        major: 2,
        minor: 0,
        patch: 0,
      });
      expect(result).toBe(true);
    });

    it("returns false for version 1.15.0", () => {
      const provider = new TerminalProvider();
      const result = provider.isVersionSupported({
        major: 1,
        minor: 15,
        patch: 0,
      });
      expect(result).toBe(false);
    });

    it("returns false for version 1.14.0", () => {
      const provider = new TerminalProvider();
      const result = provider.isVersionSupported({
        major: 1,
        minor: 14,
        patch: 5060,
      });
      expect(result).toBe(false);
    });

    it("returns false for version 0.9.0", () => {
      const provider = new TerminalProvider();
      const result = provider.isVersionSupported({
        major: 0,
        minor: 9,
        patch: 0,
      });
      expect(result).toBe(false);
    });

    it("returns false for null version", () => {
      const provider = new TerminalProvider();
      const result = provider.isVersionSupported(null);
      expect(result).toBe(false);
    });

    it("returns false for undefined version", () => {
      const provider = new TerminalProvider();
      const result = provider.isVersionSupported(undefined);
      expect(result).toBe(false);
    });
  });

  describe("findNelsonTerminal", () => {
    it("returns stored terminal if still valid", () => {
      const provider = new TerminalProvider();
      const mockTerminal = { name: "Nelson REPL", processId: 123 };
      provider.nelsonTerminal = mockTerminal;
      mockVscode.window.terminals = [mockTerminal];

      const result = provider.findNelsonTerminal();

      expect(result).toBe(mockTerminal);
    });

    it("clears stored terminal if no longer in terminal list", () => {
      const provider = new TerminalProvider();
      const mockTerminal = { name: "Nelson REPL", processId: 123 };
      provider.nelsonTerminal = mockTerminal;
      mockVscode.window.terminals = [];

      const result = provider.findNelsonTerminal();

      expect(result).toBeNull();
      expect(provider.nelsonTerminal).toBeNull();
    });

    it("finds Nelson REPL by name when not stored", () => {
      const provider = new TerminalProvider();
      const mockTerminal = { name: "Nelson REPL", processId: 456 };
      const otherTerminal = { name: "PowerShell", processId: 789 };
      mockVscode.window.terminals = [otherTerminal, mockTerminal];

      const result = provider.findNelsonTerminal();

      expect(result).toBe(mockTerminal);
      expect(provider.nelsonTerminal).toBe(mockTerminal);
    });

    it("returns null when no Nelson REPL terminal exists", () => {
      const provider = new TerminalProvider();
      const otherTerminal = { name: "PowerShell", processId: 789 };
      mockVscode.window.terminals = [otherTerminal];

      const result = provider.findNelsonTerminal();

      expect(result).toBeNull();
    });
  });
});
