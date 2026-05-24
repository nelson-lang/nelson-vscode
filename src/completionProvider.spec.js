const mockFs = {
  watch: jest.fn(() => ({ close: jest.fn() })),
  readFileSync: jest.fn(),
};
const mockChildProcess = {
  exec: jest.fn(),
};

const mockVscode = {
  CompletionItemKind: {
    Function: "Function",
  },
  MarkdownString: function (value) {
    this.value = value;
    this.isTrusted = false;
  },
  CompletionItem: function (label, kind) {
    this.label = label;
    this.kind = kind;
  },
};

jest.mock("fs", () => mockFs);
jest.mock("child_process", () => mockChildProcess);
jest.mock("vscode", () => mockVscode, { virtual: true });

describe("NelsonCompletionProvider", () => {
  let NelsonCompletionProvider;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Suppress console.error during tests
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

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

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns completion items for matching prefixes", async () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "macroOne" }),
    };
    const position = { character: 5 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );
    const labels = items.map((item) => item.label);

    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    expect(labels).toEqual(["macroOne", "macroTwo", "macroBuiltin"]);
    expect(items.every((item) => item.kind === "Function")).toBe(true);
    expect(items[0].detail).toBe("Macro function in Nelson");
    expect(items[0].documentation.value).toContain("Loading Nelson help");
    expect(items[0].nelsonHelpPending).toBe(true);
  });

  it("labels debugger command completions clearly", async () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: {
            patterns: [],
          },
          builtins: {
            patterns: [{ match: "dbstop disp" }],
          },
        },
      }),
    );

    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "db" }),
    };
    const position = { character: 2 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items[0].label).toBe("dbstop");
    expect(items[0].detail).toContain("Debugger command in Nelson");
    expect(items[0].documentation).toContain("Set a breakpoint");
  });

  it("reuses local help after resolving it once", async () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: {
            patterns: [{ match: "cos" }],
          },
          builtins: {
            patterns: [],
          },
        },
      }),
    );
    const provider = new NelsonCompletionProvider({
      resolveNelsonExecutable: () => ({ executable: "nelson" }),
      loadHelpText: jest
        .fn()
        .mockResolvedValue(
          "cos - Computes the cosine in radians for each element of x.",
        ),
    });
    const document = {
      lineAt: () => ({ text: "cos" }),
    };
    const position = { character: 3 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items[0].label).toBe("cos");
    expect(items[0].detail).toBe(
      "cos - Computes the cosine in radians for each element of x.",
    );
    expect(items[0].documentation.value).toContain("Computes the cosine");

    const cachedItems = await provider.provideCompletionItems(
      document,
      position,
      token,
    );
    expect(cachedItems[0].detail).toBe(
      "cos - Computes the cosine in radians for each element of x.",
    );
    expect(cachedItems[0].documentation.value).toContain("Computes the cosine");
    expect(cachedItems[0].nelsonHelpPending).toBe(false);
  });

  it("resolves local help when VS Code requests completion details", async () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: {
            patterns: [{ match: "plot" }],
          },
          builtins: {
            patterns: [],
          },
        },
      }),
    );

    const provider = new NelsonCompletionProvider({
      resolveNelsonExecutable: () => ({ executable: "nelson" }),
      loadHelpText: jest.fn().mockResolvedValue("plot - Create 2-D plots."),
    });
    const document = {
      lineAt: () => ({ text: "plot" }),
    };
    const position = { character: 4 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items[0].detail).toBe("plot - Create 2-D plots.");
    expect(items[0].documentation.value).toContain("Create 2-D plots");
    expect(items[0].nelsonHelpPending).toBe(false);
  });

  it("prefetches help for visible completion items", async () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: {
            patterns: [{ match: "cos cosd cospi" }],
          },
          builtins: {
            patterns: [],
          },
        },
      }),
    );

    const loadHelpText = jest.fn().mockResolvedValue(null);
    const provider = new NelsonCompletionProvider({
      resolveNelsonExecutable: () => ({ executable: "nelson" }),
      loadHelpText,
    });
    const document = {
      lineAt: () => ({ text: "cos" }),
    };
    const position = { character: 3 };
    const token = { isCancellationRequested: false };

    await provider.provideCompletionItems(document, position, token);

    expect(loadHelpText).toHaveBeenCalledWith("nelson", "cos");
    expect(loadHelpText).toHaveBeenCalledWith("nelson", "cosd");
    expect(loadHelpText).toHaveBeenCalledWith("nelson", "cospi");
  });

  it("resolves an item even when it already has the loading placeholder", async () => {
    const provider = new NelsonCompletionProvider({
      resolveNelsonExecutable: () => ({ executable: "nelson" }),
      loadHelpText: jest
        .fn()
        .mockResolvedValue("cosd - Computes the cosine in degrees."),
    });
    const token = { isCancellationRequested: false };
    const item = new mockVscode.CompletionItem(
      "cosd",
      mockVscode.CompletionItemKind.Function,
    );
    item.detail = "Macro function in Nelson";
    item.documentation = new mockVscode.MarkdownString(
      "**cosd**\n\nLoading Nelson help...",
    );
    item.nelsonSymbol = "cosd";
    item.nelsonItemType = "Macro function";
    item.nelsonHelpPending = true;

    const resolved = await provider.resolveCompletionItem(item, token);

    expect(resolved.detail).toBe("cosd - Computes the cosine in degrees.");
    expect(resolved.documentation.value).toContain("cosine in degrees");
    expect(resolved.nelsonHelpPending).toBe(false);
  });

  it("does not show local help when Nelson help is unavailable", async () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: {
            patterns: [{ match: "unknownMacro" }],
          },
          builtins: {
            patterns: [],
          },
        },
      }),
    );

    const provider = new NelsonCompletionProvider({
      resolveNelsonExecutable: () => ({ executable: "nelson" }),
      loadHelpText: jest.fn().mockResolvedValue(null),
    });
    const document = {
      lineAt: () => ({ text: "unknown" }),
    };
    const position = { character: 7 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items[0].label).toBe("unknownMacro");
    expect(items[0].detail).toBe("Macro function in Nelson");
    expect(items[0].documentation.value).toContain("Loading Nelson help");
  });

  it("normalizes JSON encoded Nelson help output", () => {
    const output =
      '" cos - Computes the cosine in radians for each element of x.\\n\\n   Syntax: \\n      res = cos(x)\\n"';

    const helpText = NelsonCompletionProvider.normalizeHelpText("cos", output);

    expect(helpText).toContain("cos - Computes the cosine");
    expect(helpText).toContain("res = cos(x)");
  });

  it("returns an empty array when the request is cancelled", async () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "macroOne" }),
    };
    const position = { character: 5 };
    const token = { isCancellationRequested: true };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items).toEqual([]);
    expect(mockFs.readFileSync).not.toHaveBeenCalled();
  });

  it("returns an empty array when no prefix is present", async () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "   " }),
    };
    const position = { character: 3 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items).toEqual([]);
    expect(mockFs.readFileSync).not.toHaveBeenCalled();
  });

  it("matches prefixes in a case-insensitive manner", async () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "MaCr" }),
    };
    const position = { character: 4 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items.map((item) => item.label)).toEqual([
      "macroOne",
      "macroTwo",
      "macroBuiltin",
    ]);
  });

  it("handles syntax file loading errors gracefully", async () => {
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error("File not found");
    });

    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "macro" }),
    };
    const position = { character: 5 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items).toEqual([]);
  });

  it("filters completions based on prefix", async () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "builtin" }),
    };
    const position = { character: 7 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items.map((item) => item.label)).toEqual(["builtinTwo"]);
  });

  it("returns all items when prefix matches multiple completions", async () => {
    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "macro" }),
    };
    const position = { character: 5 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items.map((item) => item.label)).toEqual([
      "macroOne",
      "macroTwo",
      "macroBuiltin",
    ]);
  });

  it("loads completions from every grammar pattern in a section", async () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: {
            patterns: [{ match: "macroOne" }],
          },
          builtins: {
            patterns: [{ match: "regexp" }, { match: "regexprep" }],
          },
        },
      }),
    );

    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "regex" }),
    };
    const position = { character: 5 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items.map((item) => item.label)).toEqual(["regexp", "regexprep"]);
  });

  it("includes graphics completions from the generated grammar", async () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: {
            patterns: [{ match: "planerot play playblocking plot plot3 plus" }],
          },
          builtins: {
            patterns: [],
          },
        },
      }),
    );

    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "pl" }),
    };
    const position = { character: 2 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining(["plot", "plot3", "planerot", "play"]),
    );
  });

  it("handles empty syntax file", async () => {
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        repository: {
          macros: { patterns: [] },
          builtins: { patterns: [] },
        },
      }),
    );

    const provider = new NelsonCompletionProvider();
    const document = {
      lineAt: () => ({ text: "test" }),
    };
    const position = { character: 4 };
    const token = { isCancellationRequested: false };

    const items = await provider.provideCompletionItems(
      document,
      position,
      token,
    );

    expect(items).toEqual([]);
  });
});
