import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";
import { createDefaultCommands } from "./index";

describe("default commands", () => {
  it("registers the built-in command set", () => {
    expect(Object.keys(createDefaultCommands()).sort()).toEqual([
      "!",
      "[",
      "break",
      "busybox",
      "cat",
      "cd",
      "chmod",
      "cmp",
      "continue",
      "cp",
      "cut",
      "dirname",
      "echo",
      "env",
      "export",
      "false",
      "find",
      "grep",
      "head",
      "help",
      "ln",
      "local",
      "ls",
      "mkdir",
      "mv",
      "printf",
      "pwd",
      "read",
      "readlink",
      "readonly",
      "return",
      "rm",
      "sed",
      "set",
      "sort",
      "tail",
      "test",
      "touch",
      "tr",
      "true",
      "uniq",
      "unset",
      "wc",
      "xargs",
    ]);
  });

  it("keeps common applets wired through createJsShell", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/README.md": "MARKER\n",
        "/workspace/src/index.ts": "console.log('hello')\n",
      },
    });
    const shell = createJsShell({ vfs, cwd: "/workspace" });

    await expect(shell.exec("grep -R MARKER . | head -20")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "README.md:MARKER\n",
    });

    await shell.exec("find . -type f | xargs wc -l > counts.txt");
    await expect(vfs.readText("/workspace/counts.txt")).resolves.toContain("README.md");
  });

  it("lists available commands through help and busybox --list", async () => {
    const shell = createJsShell({ cwd: "/workspace" });

    await expect(shell.exec("help")).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("grep\n"),
    });
    await expect(shell.exec("busybox --list")).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("xargs\n"),
    });
    await expect(shell.exec("busybox --help")).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("Currently defined functions:"),
    });
  });
});
