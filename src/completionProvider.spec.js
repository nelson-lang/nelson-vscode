const mockFs = {
  watch: jest.fn(() => ({ close: jest.fn() })),
  readFileSync: jest.fn(),
};

const mockVscode = {
  CompletionItemKind: {
    Function: "Function",
  },
  CompletionItem: function (label, kind) {
    this.label = label;
    this.kind = kind;
  },
};

jest.mock("fs", () => mockFs);
jest.mock("vscode", () => mockVscode, { virtual: true });

describe("NelsonCompletionProvider", () => {
  let NelsonCompletionProvider;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: {
            patterns: [{ match: "macroOne macroTwo" }],
          },
          builtins: {
            patterns: [{ match: "macroBuiltin builtinTwo" }],
          },
        },
      }),
    );

    NelsonCompletionProvider = require("./completionProvider");
  });

  it("returns completion items for matching prefixes", () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "macroOne" }),
    };
    const position = { character: 5 };
    const token = { isCancellationRequested: false };

    const items = provider.provideCompletionItems(document, position, token);
    const labels = items.map((item) => item.label);

    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    expect(labels).toEqual(["macroOne", "macroTwo", "macroBuiltin"]);
    expect(items.every((item) => item.kind === "Function")).toBe(true);
  });

  it("returns an empty array when the request is cancelled", () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "macroOne" }),
    };
    const position = { character: 5 };
    const token = { isCancellationRequested: true };

    const items = provider.provideCompletionItems(document, position, token);

    expect(items).toEqual([]);
    expect(mockFs.readFileSync).not.toHaveBeenCalled();
  });

  it("returns an empty array when no prefix is present", () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "   " }),
    };
    const position = { character: 3 };
    const token = { isCancellationRequested: false };

    const items = provider.provideCompletionItems(document, position, token);

    expect(items).toEqual([]);
    expect(mockFs.readFileSync).not.toHaveBeenCalled();
  });

  it("matches prefixes in a case-insensitive manner", () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "MaCr" }),
    };
    const position = { character: 4 };
    const token = { isCancellationRequested: false };

    const items = provider.provideCompletionItems(document, position, token);

    expect(items.map((item) => item.label)).toEqual([
      "macroOne",
      "macroTwo",
      "macroBuiltin",
    ]);
  });
});
