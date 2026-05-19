import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../src";

describe("js-shell", () => {
  it("runs pipelines, redirections, fd redirects, and common applets", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/README.md": "# Demo\n\nMARKER: update this file\n",
        "/workspace/src/index.ts": "console.log('hello')\n",
      },
    });
    const shell = createJsShell({ vfs, cwd: "/workspace" });

    await expect(shell.exec("grep -R MARKER . | head -20")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "README.md:MARKER: update this file\n",
    });

    await shell.exec("find . -type f | xargs wc -l > counts.txt");
    expect(await vfs.readText("/workspace/counts.txt")).toContain("README.md");

    await shell.exec("printf 'oops\\n' 1>&2 2>> errors.log");
    expect(await vfs.readText("/workspace/errors.log")).toBe("oops\n");

    await shell.exec("echo changed >> README.md");
    expect(await vfs.readText("/workspace/README.md")).toContain("changed\n");
  });

  it("supports expansion and short-circuit operators", async () => {
    const shell = createJsShell({ cwd: "/workspace", env: { NAME: "pi" } });

    await expect(shell.exec("echo hello-$NAME && false || echo fallback")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "hello-pi\nfallback\n",
    });

    await expect(shell.exec("echo $((1 + 2))")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "3\n",
    });
  });

  it("allows command overrides", async () => {
    const shell = createJsShell({
      commands: {
        hello: () => ({ exitCode: 0, stdout: "custom\n", stderr: "" }),
      },
    });

    await expect(shell.exec("hello")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "custom\n",
    });
  });
});
