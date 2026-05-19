import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("cat busybox compatibility", () => {
  it("cat/cat-prints-a-file", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/foo": "I WANT\n" } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cat foo > bar")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.readText("/workspace/bar")).resolves.toBe("I WANT\n");
  });

  it("cat/cat-prints-a-file-and-standard-input", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/foo": "I WANT\n" } });
    const shell = createJsShell({ vfs });

    await shell.exec("busybox cat foo - > bar", { stdin: "SOMETHING\n" });

    await expect(vfs.readText("/workspace/bar")).resolves.toBe("I WANT\nSOMETHING\n");
  });

  it("cat.tests cat -e, -v, -n, and -b", async () => {
    const shell = createJsShell();

    await expect(shell.exec("cat -e", { stdin: "foo\n" })).resolves.toMatchObject({ stdout: "foo$\n" });
    await expect(shell.exec("cat -v", { stdin: "foo\n" })).resolves.toMatchObject({ stdout: "foo\n" });
    await expect(shell.exec("cat -n", { stdin: "line 1\n\nline 3\n" })).resolves.toMatchObject({
      stdout: "     1\tline 1\n     2\t\n     3\tline 3\n",
    });
    await expect(shell.exec("cat -b", { stdin: "line 1\n\nline 3\n" })).resolves.toMatchObject({
      stdout: "     1\tline 1\n\n     2\tline 3\n",
    });
  });
});
