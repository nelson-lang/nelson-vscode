const mockCompletionDisposable = { dispose: jest.fn() };
const mockCommandDisposable = { dispose: jest.fn() };
const mockTerminalDisposables = [
  { dispose: jest.fn() },
  { dispose: jest.fn() },
  { dispose: jest.fn() },
  { dispose: jest.fn() },
  { dispose: jest.fn() },
  { dispose: jest.fn() },
  { dispose: jest.fn() },
];
const mockStatusBarItem = {
  command: null,
  text: "",
  tooltip: "",
  show: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
};

const mockVscode = {
  StatusBarAlignment: {
    Left: "Left",
  },
  languages: {
    registerCompletionItemProvider: jest
      .fn()
      .mockReturnValue(mockCompletionDisposable),
  },
  commands: {
    registerCommand: jest.fn().mockReturnValue(mockCommandDisposable),
  },
  window: {
    activeTextEditor: null,
    createStatusBarItem: jest.fn().mockReturnValue(mockStatusBarItem),
    onDidChangeActiveTextEditor: jest
      .fn()
      .mockReturnValue({ dispose: jest.fn() }),
  },
  workspace: {
    onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  },
};

const mockLanguageCommands = {
  newFileDocument: jest.fn(),
};

const mockRegisterTerminalProvider = jest
  .fn()
  .mockReturnValue(mockTerminalDisposables);

const mockTerminalProviderInstance = {
  registerTerminalProvider: mockRegisterTerminalProvider,
  resolveNelsonExecutable: jest.fn().mockReturnValue({ executable: "nelson" }),
};

const mockCompletionProviderInstance = { dispose: jest.fn() };
const mockCompletionProvider = jest.fn(() => mockCompletionProviderInstance);
const mockTerminalProvider = jest.fn(() => mockTerminalProviderInstance);

jest.mock("vscode", () => mockVscode, { virtual: true });
jest.mock("./languageCommands", () => mockLanguageCommands);
jest.mock("./completionProvider", () => mockCompletionProvider);
jest.mock("./terminalProvider", () => mockTerminalProvider);

describe("extension activate", () => {
  let extension;
  let context;

  beforeEach(() => {
    jest.resetModules();
    context = {
      subscriptions: {
        push: jest.fn(),
      },
    };
    mockVscode.window.activeTextEditor = {
      document: { languageId: "nelson", fileName: "script.m" },
    };

    extension = require("./extension");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("registers completion provider, commands, and terminal support", () => {
    extension.activate(context);

    expect(mockCompletionProvider).toHaveBeenCalledTimes(1);
    const completionArgs =
      mockVscode.languages.registerCompletionItemProvider.mock.calls[0];

    expect(completionArgs[0]).toEqual({ language: "nelson", scheme: "file" });
    expect(completionArgs[1]).toBeInstanceOf(Object);
    expect(completionArgs.slice(2)).toEqual(
      expect.arrayContaining([".", "(", "a", "A", "_"]),
    );

    expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
      "nelson.newFileDocument",
      mockLanguageCommands.newFileDocument,
    );

    expect(mockTerminalProvider).toHaveBeenCalledTimes(1);
    expect(mockRegisterTerminalProvider).toHaveBeenCalledTimes(1);

    expect(context.subscriptions.push).toHaveBeenCalledWith(
      mockCompletionDisposable,
      mockCompletionProviderInstance,
      mockCommandDisposable,
      ...mockTerminalDisposables,
    );
  });

  it("exposes a deactivate function", () => {
    extension.activate(context);

    expect(() => extension.deactivate()).not.toThrow();
    expect(mockCompletionProviderInstance.dispose).toHaveBeenCalled();
  });

  it("deactivate is safe before activate", () => {
    expect(() => extension.deactivate()).not.toThrow();
  });

  it("registers all required disposables", () => {
    extension.activate(context);

    expect(context.subscriptions.push).toHaveBeenCalledTimes(2);
    const statusPushArgs = context.subscriptions.push.mock.calls[0];
    const activationPushArgs = context.subscriptions.push.mock.calls[1];
    expect(statusPushArgs).toHaveLength(3); // status bar + two listeners
    expect(activationPushArgs).toHaveLength(10); // completion registration + provider cleanup + 1 command + 7 terminal
  });

  it("creates and updates the Nelson status bar item", () => {
    extension.activate(context);

    expect(mockVscode.window.createStatusBarItem).toHaveBeenCalledWith(
      mockVscode.StatusBarAlignment.Left,
      100,
    );
    expect(mockStatusBarItem.command).toBe("nelson.statusBarAction");
    expect(mockStatusBarItem.text).toBe("$(terminal) Nelson: PATH");
    expect(mockStatusBarItem.show).toHaveBeenCalled();
  });

  it("creates completion provider with correct trigger characters", () => {
    extension.activate(context);

    const completionArgs =
      mockVscode.languages.registerCompletionItemProvider.mock.calls[0];
    const triggerChars = completionArgs.slice(2);

    expect(triggerChars).toContain(".");
    expect(triggerChars).toContain("(");
    expect(triggerChars).toContain("_");
    expect(triggerChars.filter((c) => /[a-z]/.test(c))).toHaveLength(26);
    expect(triggerChars.filter((c) => /[A-Z]/.test(c))).toHaveLength(26);
  });

  it("initializes terminal provider correctly", () => {
    extension.activate(context);

    expect(mockTerminalProvider).toHaveBeenCalled();
    expect(
      mockTerminalProviderInstance.registerTerminalProvider,
    ).toHaveBeenCalled();
  });
});
