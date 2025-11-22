const mockVscode = {
  workspace: {
    openTextDocument: jest.fn(),
  },
  window: {
    showTextDocument: jest.fn(),
  },
};

jest.mock("vscode", () => mockVscode, { virtual: true });

describe("languageCommands", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("opens a new Nelson document and shows it", async () => {
    const fakeDocument = { uri: "nelson" };
    mockVscode.workspace.openTextDocument.mockResolvedValue(fakeDocument);

    const languageCommands = require("./languageCommands");

    await languageCommands.newFileDocument();

    expect(mockVscode.workspace.openTextDocument).toHaveBeenCalledWith({
      language: "nelson",
    });
    expect(mockVscode.window.showTextDocument).toHaveBeenCalledWith(
      fakeDocument,
    );
  });
});
