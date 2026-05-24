const fs = require("fs");
const path = require("path");

const rootPath = path.join(__dirname, "..");
const stableGrammarSymbols = ["cos", "disp", "help", "sin", "zeros"];

function readJsonC(relativePath) {
  const content = fs.readFileSync(path.join(rootPath, relativePath), "utf8");
  return JSON.parse(content.replace(/^\s*\/\/.*$/gm, ""));
}

describe("Nelson syntax configuration", () => {
  function readGrammar() {
    return JSON.parse(
      fs.readFileSync(
        path.join(rootPath, "syntaxes", "nelson.tmLanguage.json"),
        "utf8",
      ),
    );
  }

  function extractSymbols(section) {
    return section.patterns.flatMap((pattern) => {
      const symbolGroup = pattern.match.match(/\\b\((.*)\)(?:\\b)?$/);
      return symbolGroup ? symbolGroup[1].split("|") : [];
    });
  }

  it("configures MATLAB-style block comments", () => {
    const configuration = readJsonC("language-configuration.json");

    expect(configuration.comments).toMatchObject({
      lineComment: "%",
      blockComment: ["%{", "%}"],
    });
  });

  it("defines block comments before line comments in the TextMate grammar", () => {
    const grammar = readGrammar();
    const commentPatterns = grammar.repository.comment.patterns;

    expect(commentPatterns[0]).toMatchObject({
      begin: "%\\{",
      end: "%\\}",
      name: "comment.block.percentage.nelson",
      beginCaptures: {
        0: {
          name: "punctuation.definition.comment.begin.nelson",
        },
      },
      endCaptures: {
        0: {
          name: "punctuation.definition.comment.end.nelson",
        },
      },
    });
    expect(commentPatterns[1]).toMatchObject({
      begin: "%",
      name: "comment.line.percentage.nelson",
    });
  });

  it("highlights Nelson 1.17.0 arguments blocks as keywords", () => {
    const grammar = readGrammar();
    const keywords = extractSymbols(grammar.repository.keywords);

    expect(keywords).toContain("arguments");
  });

  it("includes representative functions in grammar symbols", () => {
    const grammar = readGrammar();
    const grammarSymbols = [
      ...extractSymbols(grammar.repository.builtins),
      ...extractSymbols(grammar.repository.macros),
    ];

    expect(grammarSymbols).toEqual(
      expect.arrayContaining(stableGrammarSymbols),
    );
  });

  it("provides snippets for arguments validation blocks", () => {
    const snippets = JSON.parse(
      fs.readFileSync(path.join(rootPath, "snippets", "nelson.json"), "utf8"),
    );

    expect(snippets["Arguments Block"].body).toEqual(
      expect.arrayContaining(["arguments", "end"]),
    );
    expect(snippets["Output Arguments Block"].body[0]).toBe(
      "arguments (Output)",
    );
    expect(snippets["Optional Argument"].body.join("\n")).toContain(
      "= ${3:defaultValue}",
    );
    expect(snippets["Name-Value Arguments Block"].body.join("\n")).toContain(
      "${1:options}.${2:name}",
    );
  });
});
