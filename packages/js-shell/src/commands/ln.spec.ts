import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("ln busybox compatibility", () => {
  it("ln/ln-creates-hard-links", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/file1": "file number one\n" } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox ln file1 link1")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.readText("/workspace/link1")).resolves.toBe("file number one\n");
  });

  it("ln/ln-creates-soft-links", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/file1": "file number one\n" } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox ln -s file1 link1")).resolves.toMatchObject({ exitCode: 0 });
    await expect(shell.exec("readlink link1")).resolves.toMatchObject({ stdout: "file1\n" });
  });

  it("ln force variants replace existing destination", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/file1": "file number one\n",
        "/workspace/link1": "file number two\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox ln -f file1 link1")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.readText("/workspace/link1")).resolves.toBe("file number one\n");

    await expect(shell.exec("busybox ln -f -s file1 link1")).resolves.toMatchObject({ exitCode: 0 });
    await expect(shell.exec("readlink link1")).resolves.toMatchObject({ stdout: "file1\n" });
  });

  it("ln preserve variants fail when destination exists", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/file1": "file number one\n",
        "/workspace/link1": "file number two\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox ln file1 link1")).resolves.toMatchObject({ exitCode: 1 });
    await expect(shell.exec("busybox ln -s file1 link1")).resolves.toMatchObject({ exitCode: 1 });
  });
});
