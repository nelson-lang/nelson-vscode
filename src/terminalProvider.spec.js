const fs = require("fs");
const os = require("os");
const path = require("path");

const mockVscode = {
  workspace: {
    getConfiguration: jest.fn(),
  },
  window: {
    showErrorMessage: jest.fn(),
    registerTerminalProfileProvider: jest.fn(),
    createTerminal: jest.fn(),
    onDidCloseTerminal: jest.fn(),
    terminals: [],
  },
  commands: {
    registerCommand: jest.fn(),
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
    };
    mockVscode.workspace.getConfiguration.mockReturnValue(configuration);
    mockVscode.window.registerTerminalProfileProvider.mockReturnValue({
      dispose: jest.fn(),
    });
    mockVscode.commands.registerCommand.mockReturnValue({ dispose: jest.fn() });

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
      "nelson.runActiveFile",
      expect.any(Function),
    );
    expect(registrations).toHaveLength(3);
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
