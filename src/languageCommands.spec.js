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

  it("calls openTextDocument with correct language parameter", async () => {
    const fakeDocument = { uri: "nelson", languageId: "nelson" };
    mockVscode.workspace.openTextDocument.mockResolvedValue(fakeDocument);

    const languageCommands = require("./languageCommands");

    await languageCommands.newFileDocument();

    const callArgs = mockVscode.workspace.openTextDocument.mock.calls[0][0];
    expect(callArgs).toEqual({ language: "nelson" });
  });
});
