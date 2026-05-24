const mockFs = {
  watch: jest.fn(() => ({ close: jest.fn() })),
  readFileSync: jest.fn(),
  existsSync: jest.fn(() => false),
  statSync: jest.fn(() => ({ isFile: () => true })),
};
const mockChildProcess = {
  execFile: jest.fn(),
  spawn: jest.fn(() => ({ on: jest.fn(), unref: jest.fn() })),
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
    mockFs.existsSync.mockReturnValue(false);
    mockFs.statSync.mockReturnValue({ isFile: () => true });
    mockChildProcess.execFile.mockImplementation(
      (command, args, options, callback) => {
        callback(null, '"/opt/nelson/modules/help_tools"\n', "");
      },
    );

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
    expect(items[0].documentation).toBeUndefined();
    expect(items[0].nelsonHelpPending).toBe(false);
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

  it("clears the loading placeholder when no help can be resolved", async () => {
    const provider = new NelsonCompletionProvider({
      resolveNelsonExecutable: () => ({ executable: "nelson" }),
      loadHelpText: jest.fn().mockResolvedValue(null),
    });
    const token = { isCancellationRequested: false };
    const item = new mockVscode.CompletionItem(
      "unknown",
      mockVscode.CompletionItemKind.Function,
    );
    item.detail = "Macro function in Nelson";
    item.documentation = new mockVscode.MarkdownString(
      "**unknown**\n\nLoading Nelson help...",
    );
    item.nelsonSymbol = "unknown";
    item.nelsonItemType = "Macro function";
    item.nelsonHelpPending = true;

    const resolved = await provider.resolveCompletionItem(item, token);

    expect(resolved.detail).toBe("Macro function in Nelson");
    expect(resolved.documentation).toBeUndefined();
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
    expect(items[0].documentation).toBeUndefined();
    expect(items[0].nelsonHelpPending).toBe(false);
  });

  it("formats help text from Nelson JSON entries", () => {
    const helpText = NelsonCompletionProvider.formatNelsonJsonHelpEntry("cos", {
      keyword: "cos",
      short_description:
        "Computes the cosine in radians for each element of x.",
      syntax: ["res = cos(x)"],
      input_arguments: { name: "x", description: "a numeric value" },
      output_arguments: { name: "res", description: "a numeric value" },
      see_also: ["acos"],
    });

    expect(helpText).toContain("cos - Computes the cosine");
    expect(helpText).toContain("res = cos(x)");
    expect(helpText).toContain("x: a numeric value");
    expect(helpText).toContain("See also: acos");
  });

  it("loads help from the Nelson JSON help index path returned by Nelson", async () => {
    const grammarJson = JSON.stringify({
      repository: {
        macros: { patterns: [] },
        builtins: { patterns: [{ match: "cos" }] },
      },
    });
    const helpJson = JSON.stringify({
      cos: {
        keyword: "cos",
        short_description:
          "Computes the cosine in radians for each element of x.",
      },
    });
    mockFs.existsSync.mockImplementation((filePath) => {
      return String(filePath).endsWith("nelson_help_en_US.json");
    });
    mockFs.readFileSync.mockImplementation((filePath) => {
      return String(filePath).endsWith("nelson_help_en_US.json")
        ? helpJson
        : grammarJson;
    });

    const helpText = await NelsonCompletionProvider.loadNelsonHelpText(
      "/opt/nelson/bin/nelson",
      "cos",
    );

    expect(helpText).toContain("cos - Computes the cosine");
    const [command, args, options, callback] =
      mockChildProcess.execFile.mock.calls[0];
    expect(command).toEqual(expect.any(String));
    expect(args).toEqual(
      expect.arrayContaining([
        "-adv-cli",
        "--quiet",
        "-e",
        "disp(jsonencode(modulepath('help_tools'))),quit",
      ]),
    );
    expect(options).toEqual(expect.objectContaining({ windowsHide: true }));
    expect(callback).toEqual(expect.any(Function));
  });

  it("falls back to a local help module path when Nelson cannot report modulepath", async () => {
    const grammarJson = JSON.stringify({
      repository: {
        macros: { patterns: [] },
        builtins: { patterns: [{ match: "cos" }] },
      },
    });
    const helpJson = JSON.stringify({
      cos: {
        keyword: "cos",
        short_description:
          "Computes the cosine in radians for each element of x.",
      },
    });
    mockChildProcess.execFile.mockImplementation(
      (command, args, options, callback) => {
        callback(new Error("Nelson unavailable"), "", "");
      },
    );
    mockFs.existsSync.mockImplementation((filePath) => {
      const normalized = String(filePath).replace(/\\/g, "/");
      return (
        normalized.endsWith("/nelson/bin/nelson") ||
        normalized.endsWith("/nelson/modules/help_tools/help") ||
        normalized.endsWith(
          "/nelson/modules/help_tools/help/nelson_help_en_US.json",
        )
      );
    });
    mockFs.readFileSync.mockImplementation((filePath) => {
      return String(filePath).endsWith("nelson_help_en_US.json")
        ? helpJson
        : grammarJson;
    });

    const helpText = await NelsonCompletionProvider.loadNelsonHelpText(
      "/opt/nelson/bin/nelson",
      "cos",
    );

    expect(helpText).toContain("cos - Computes the cosine");
  });

  it("terminates the Nelson modulepath process when it times out", async () => {
    jest.useFakeTimers();
    const child = {
      pid: 12345,
      kill: jest.fn(),
    };
    mockChildProcess.execFile.mockImplementation(() => child);

    const helpPathPromise =
      NelsonCompletionProvider.loadNelsonHelpModulePath("nelson");
    jest.advanceTimersByTime(5000);
    const helpPath = await helpPathPromise;

    expect(helpPath).toBeNull();
    if (process.platform === "win32") {
      expect(mockChildProcess.spawn).toHaveBeenCalledWith(
        "taskkill",
        ["/pid", "12345", "/t", "/f"],
        { windowsHide: true },
      );
    } else {
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    }
    jest.useRealTimers();
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
