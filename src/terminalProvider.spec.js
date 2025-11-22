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

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

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
    expect(registrations).toHaveLength(2);
  });
});
