import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("readlink busybox compatibility", () => {
  it("readlink.tests reads symbolic links but not regular files", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/readlink_testdir/testfile": "",
      },
      symlinks: {
        "/workspace/testlink": "./readlink_testdir/testfile",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox readlink ./readlink_testdir/testfile")).resolves.toMatchObject({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });
    await expect(shell.exec("busybox readlink ./testlink")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "./readlink_testdir/testfile\n",
    });
  });

  it("readlink.tests resolves canonical paths with -f", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/readlink_testdir/testfile": "",
      },
      symlinks: {
        "/workspace/testlink": "./readlink_testdir/testfile",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox readlink -f ./readlink_testdir/testfile")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "/workspace/readlink_testdir/testfile\n",
    });
    await expect(shell.exec("busybox readlink -f ./testlink")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "/workspace/readlink_testdir/testfile\n",
    });
    await expect(shell.exec("busybox readlink -f readlink_testdir/../readlink_testdir/testfile")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "/workspace/readlink_testdir/testfile\n",
    });
  });

  it("readlink.tests returns failure for invalid canonical links", async () => {
    const vfs = createMemoryVFS({
      dirs: ["/workspace/readlink_testdir"],
      symlinks: {
        "/workspace/readlink_testdir/badlink": "./missing",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox readlink -f ./readlink_testdir/badlink")).resolves.toMatchObject({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });
  });

  it("readlink -f resolves symlinks in the middle of a path", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/real/sub/file": "ok\n",
      },
      symlinks: {
        "/workspace/linkdir": "real",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox readlink -f linkdir/sub/file")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "/workspace/real/sub/file\n",
    });
  });
});
