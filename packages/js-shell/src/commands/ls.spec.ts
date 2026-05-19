import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("ls busybox compatibility", () => {
  it("ls/ls-1-works sorts one entry per line", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/d/c": "",
        "/workspace/d/a": "",
        "/workspace/d/b": "",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox ls -1 d")).resolves.toMatchObject({ stdout: "a\nb\nc\n" });
  });

  it("ls/ls-l-works uses long format without total line", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/d/file": "hello\n",
      },
      dirs: ["/workspace/d/subdir"],
      symlinks: {
        "/workspace/d/link": "file",
      },
    });
    const shell = createJsShell({ vfs });

    const result = await shell.exec("busybox ls -l d");

    expect(result.stdout).not.toContain("total");
    expect(result.stdout).toContain("-rw-r--r--      6 file\n");
    expect(result.stdout).toContain("lrwxrwxrwx      4 link -> file\n");
    expect(result.stdout).toContain("drwxr-xr-x      0 subdir\n");
  });

  it("ls/ls-s-works prints block counts", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/d/empty": "",
        "/workspace/d/file": "hello\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox ls -1s d")).resolves.toMatchObject({
      stdout: "   0 empty\n   1 file\n",
    });
  });

  it("ls/ls-h-works humanizes long sizes", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/d/big": "x".repeat(2048),
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox ls -lh d")).resolves.toMatchObject({
      stdout: "-rw-r--r--     2K big\n",
    });
  });

  it("ls symlink_to_dir lists the pointed directory when addressed", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/ls.testdir/foo/file": "bar\n",
      },
      symlinks: {
        "/workspace/ls.testdir/symfoo": "foo",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox ls ls.testdir/symfoo")).resolves.toMatchObject({ stdout: "file\n" });
  });
});
