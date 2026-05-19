import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("find busybox compatibility", () => {
  it("find -type f", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/find.tempdir/testfile": "" } });
    const shell = createJsShell({ vfs, cwd: "/workspace/find.tempdir" });

    await expect(shell.exec("busybox find -type f")).resolves.toMatchObject({ stdout: "./testfile\n" });
  });

  it("find -exec exit codes", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/find.tempdir/testfile": "" } });
    const shell = createJsShell({ vfs, cwd: "/workspace/find.tempdir" });

    await expect(shell.exec("busybox find testfile -exec true {} ;")).resolves.toMatchObject({ exitCode: 0, stdout: "" });
    await expect(shell.exec("busybox find testfile -exec true {} +")).resolves.toMatchObject({ exitCode: 0, stdout: "" });
    await expect(shell.exec("busybox find testfile -exec false {} ;")).resolves.toMatchObject({ exitCode: 0 });
    await expect(shell.exec("busybox find testfile -exec false {} +")).resolves.toMatchObject({ exitCode: 1 });
  });

  it("find -maxdepth and -name", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox find / -maxdepth 0 -name /")).resolves.toMatchObject({ stdout: "/\n" });
    await expect(shell.exec("busybox find / -maxdepth 0 -name //")).resolves.toMatchObject({ stdout: "" });
  });

  it("find -name on dotted path", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/a": "" } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox find ./// -name .")).resolves.toMatchObject({ stdout: ".///\n" });
    await expect(shell.exec("busybox find ./// -name .///")).resolves.toMatchObject({ stdout: "" });
  });
});
