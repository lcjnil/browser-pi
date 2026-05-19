import { describe, expect, it } from "vitest";
import { createJsShellAdapter, createMemoryVFS } from "../src/runtime";

describe("runtime js-shell adapter", () => {
  it("executes against the existing BrowserVFS", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/a.txt": "one\nMARKER two\n",
      },
    });
    const shell = createJsShellAdapter({ vfs, cwd: "/workspace" });

    const result = await shell.exec("grep -R MARKER . > found.txt", { cwd: "/workspace" });

    expect(result.exitCode).toBe(0);
    expect(await vfs.readText("/workspace/found.txt")).toBe("a.txt:MARKER two\n");
  });
});
