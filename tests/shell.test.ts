import { describe, expect, it } from "vitest";
import { createJsShellAdapter, createMemoryVFS } from "../src/runtime";

describe("shell adapter", () => {
  it("runs pipelines, grep, find, xargs, and write-through redirection", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/a.txt": "one\nMARKER two\n",
        "/workspace/b.txt": "three\n",
      },
    });
    const shell = createJsShellAdapter({ vfs });

    await expect(shell.exec("echo hello | tr a-z A-Z", { cwd: "/workspace" }))
      .resolves.toMatchObject({ exitCode: 0, stdout: "HELLO\n" });

    await expect(shell.exec("grep -R MARKER . | head -20", { cwd: "/workspace" }))
      .resolves.toMatchObject({ exitCode: 0, stdout: "a.txt:MARKER two\n" });

    await expect(shell.exec("find . -type f | xargs wc -l", { cwd: "/workspace" }))
      .resolves.toMatchObject({ exitCode: 0 });

    await shell.exec("echo changed > notes.txt", { cwd: "/workspace" });
    expect(await vfs.readText("/workspace/notes.txt")).toBe("changed\n");
  });

});
