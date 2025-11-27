const mockCompletionDisposable = { dispose: jest.fn() };
const mockCommandDisposable = { dispose: jest.fn() };
const mockTerminalDisposables = [
  { dispose: jest.fn() },
  { dispose: jest.fn() },
  { dispose: jest.fn() },
];

const mockVscode = {
  languages: {
    registerCompletionItemProvider: jest
      .fn()
      .mockReturnValue(mockCompletionDisposable),
  },
  commands: {
    registerCommand: jest.fn().mockReturnValue(mockCommandDisposable),
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
};

const mockCompletionProvider = jest.fn(() => ({}));
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
      mockCommandDisposable,
      ...mockTerminalDisposables,
    );
  });

  it("exposes a deactivate function", () => {
    expect(() => extension.deactivate()).not.toThrow();
  });

  it("registers all required disposables", () => {
    extension.activate(context);

    expect(context.subscriptions.push).toHaveBeenCalledTimes(1);
    const pushArgs = context.subscriptions.push.mock.calls[0];
    expect(pushArgs).toHaveLength(5); // 1 completion + 1 command + 3 terminal
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
