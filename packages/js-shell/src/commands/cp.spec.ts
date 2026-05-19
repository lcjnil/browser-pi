import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("cp busybox compatibility", () => {
  it("cp/cp-copies-empty-file, small-file, large-file, and preserves-source-file", async () => {
    const large = "\0".repeat(10 * 1024) + "x";
    const vfs = createMemoryVFS({
      files: {
        "/workspace/empty": "",
        "/workspace/small": "I WANT\n",
        "/workspace/large": large,
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cp empty empty.copy")).resolves.toMatchObject({ exitCode: 0 });
    await expect(shell.exec("busybox cp small small.copy")).resolves.toMatchObject({ exitCode: 0 });
    await expect(shell.exec("busybox cp large large.copy")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.readText("/workspace/empty.copy")).resolves.toBe("");
    await expect(vfs.readText("/workspace/small.copy")).resolves.toBe("I WANT\n");
    await expect(vfs.readFile("/workspace/large.copy")).resolves.toEqual(await vfs.readFile("/workspace/large"));
    await expect(vfs.exists("/workspace/small")).resolves.toBe(true);
  });

  it("cp/cp-files-to-dir follows file symlinks and copies multiple files into a directory", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/file1": "file number one\n",
        "/workspace/file2": "file number two\n",
        "/workspace/file3": "",
      },
      dirs: ["/workspace/there"],
      symlinks: {
        "/workspace/link1": "file2",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cp file1 file2 file3 link1 there")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.readText("/workspace/there/file1")).resolves.toBe("file number one\n");
    await expect(vfs.readText("/workspace/there/file2")).resolves.toBe("file number two\n");
    await expect((await vfs.stat("/workspace/there/file3")).size).toBe(0);
    await expect(vfs.readText("/workspace/there/link1")).resolves.toBe("file number two\n");
    await expect(vfs.stat("/workspace/there/link1")).resolves.toMatchObject({ kind: "file" });
  });

  it("cp/cp-d-files-to-dir preserves symlinks with -d", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/file1": "file number one\n",
        "/workspace/file2": "file number two\n",
        "/workspace/file3": "",
      },
      dirs: ["/workspace/there"],
      symlinks: {
        "/workspace/link1": "file2",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cp -d file1 file2 file3 link1 there")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.readText("/workspace/there/file1")).resolves.toBe("file number one\n");
    await expect(vfs.readText("/workspace/there/file2")).resolves.toBe("file number two\n");
    await expect((await vfs.stat("/workspace/there/file3")).size).toBe(0);
    await expect(vfs.stat("/workspace/there/link1")).resolves.toMatchObject({ kind: "symlink" });
    await expect(vfs.readlink("/workspace/there/link1")).resolves.toBe("file2");
  });

  it("cp/cp-follows-links and cp-preserves-links", async () => {
    const vfs = createMemoryVFS({
      files: { "/workspace/foo": "target\n" },
      symlinks: { "/workspace/bar": "foo" },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cp bar baz")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.stat("/workspace/baz")).resolves.toMatchObject({ kind: "file" });
    await expect(vfs.readText("/workspace/baz")).resolves.toBe("target\n");

    await expect(shell.exec("busybox cp -d bar preserved")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.stat("/workspace/preserved")).resolves.toMatchObject({ kind: "symlink" });
    await expect(vfs.readlink("/workspace/preserved")).resolves.toBe("foo");
  });

  it("cp/cp-a-files-to-dir and cp-a-preserves-links archive directories and links", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/file1": "file number one\n",
        "/workspace/file2": "file number two\n",
        "/workspace/dir1/file3": "",
      },
      dirs: ["/workspace/there"],
      symlinks: {
        "/workspace/link1": "file2",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cp -a file1 file2 link1 dir1 there")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.readText("/workspace/there/file1")).resolves.toBe("file number one\n");
    await expect(vfs.readText("/workspace/there/file2")).resolves.toBe("file number two\n");
    await expect(vfs.stat("/workspace/there/link1")).resolves.toMatchObject({ kind: "symlink" });
    await expect(vfs.readlink("/workspace/there/link1")).resolves.toBe("file2");
    await expect(vfs.stat("/workspace/there/dir1/file3")).resolves.toMatchObject({ kind: "file", size: 0 });
  });

  it("cp/cp-dir-create-dir and cp-dir-existing-dir recursively copy directories", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/bar/baz": "",
      },
      dirs: ["/workspace/foo"],
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cp -R bar created")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.stat("/workspace/created/baz")).resolves.toMatchObject({ kind: "file" });

    await expect(shell.exec("busybox cp -R bar foo")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.stat("/workspace/foo/bar/baz")).resolves.toMatchObject({ kind: "file" });
  });

  it("cp/cp-parents preserves source parent directories under the target", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/foo/bar/baz/file": "",
      },
      dirs: ["/workspace/dir"],
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cp --parents foo/bar/baz/file dir")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.stat("/workspace/dir/foo/bar/baz/file")).resolves.toMatchObject({ kind: "file" });
  });

  it("cp.tests default, -d, -P, -L, and -H symlink handling for non-recursive copies", async () => {
    const vfs = createCpTestVfs();
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cp * ../cp.testdir2", { cwd: "/workspace/cp.testdir" })).resolves.toMatchObject({
      exitCode: 1,
      stderr: "cp: omitting directory 'dir'\ncp: omitting directory 'dir_symlink'\n",
    });
    await expect(vfs.stat("/workspace/cp.testdir2/file")).resolves.toMatchObject({ kind: "file" });
    await expect(vfs.stat("/workspace/cp.testdir2/file_symlink")).resolves.toMatchObject({ kind: "file" });
    await expect(vfs.exists("/workspace/cp.testdir2/dir")).resolves.toBe(false);
    await expect(vfs.exists("/workspace/cp.testdir2/dir_symlink")).resolves.toBe(false);

    const preserveVfs = createCpTestVfs();
    const preserveShell = createJsShell({ vfs: preserveVfs });
    await expect(preserveShell.exec("busybox cp -d * ../cp.testdir2", { cwd: "/workspace/cp.testdir" })).resolves.toMatchObject({
      exitCode: 1,
      stderr: "cp: omitting directory 'dir'\n",
    });
    await expect(preserveVfs.stat("/workspace/cp.testdir2/file_symlink")).resolves.toMatchObject({ kind: "symlink" });
    await expect(preserveVfs.stat("/workspace/cp.testdir2/dir_symlink")).resolves.toMatchObject({ kind: "symlink" });

    const followVfs = createCpTestVfs();
    const followShell = createJsShell({ vfs: followVfs });
    await expect(followShell.exec("busybox cp -L * ../cp.testdir2", { cwd: "/workspace/cp.testdir" })).resolves.toMatchObject({
      exitCode: 1,
      stderr: "cp: omitting directory 'dir'\ncp: omitting directory 'dir_symlink'\n",
    });
    await expect(followVfs.stat("/workspace/cp.testdir2/file_symlink")).resolves.toMatchObject({ kind: "file" });
  });

  it("cp.tests recursive -R, -RH, and -RL symlink handling", async () => {
    const recursiveVfs = createCpTestVfs();
    const recursiveShell = createJsShell({ vfs: recursiveVfs });
    await expect(recursiveShell.exec("busybox cp -R * ../cp.testdir2", { cwd: "/workspace/cp.testdir" })).resolves.toMatchObject({ exitCode: 0 });
    await expect(recursiveVfs.stat("/workspace/cp.testdir2/file")).resolves.toMatchObject({ kind: "file" });
    await expect(recursiveVfs.stat("/workspace/cp.testdir2/file_symlink")).resolves.toMatchObject({ kind: "symlink" });
    await expect(recursiveVfs.stat("/workspace/cp.testdir2/dir")).resolves.toMatchObject({ kind: "directory" });
    await expect(recursiveVfs.stat("/workspace/cp.testdir2/dir_symlink")).resolves.toMatchObject({ kind: "symlink" });
    await expect(recursiveVfs.stat("/workspace/cp.testdir2/dir/file_symlink")).resolves.toMatchObject({ kind: "symlink" });

    const commandLineFollowVfs = createCpTestVfs();
    const commandLineFollowShell = createJsShell({ vfs: commandLineFollowVfs });
    await expect(commandLineFollowShell.exec("busybox cp -RH * ../cp.testdir2", { cwd: "/workspace/cp.testdir" })).resolves.toMatchObject({ exitCode: 0 });
    await expect(commandLineFollowVfs.stat("/workspace/cp.testdir2/file_symlink")).resolves.toMatchObject({ kind: "file" });
    await expect(commandLineFollowVfs.stat("/workspace/cp.testdir2/dir_symlink")).resolves.toMatchObject({ kind: "directory" });
    await expect(commandLineFollowVfs.stat("/workspace/cp.testdir2/dir/file_symlink")).resolves.toMatchObject({ kind: "symlink" });

    const followAllVfs = createCpTestVfs();
    const followAllShell = createJsShell({ vfs: followAllVfs });
    await expect(followAllShell.exec("busybox cp -RL * ../cp.testdir2", { cwd: "/workspace/cp.testdir" })).resolves.toMatchObject({ exitCode: 0 });
    await expect(followAllVfs.stat("/workspace/cp.testdir2/file_symlink")).resolves.toMatchObject({ kind: "file" });
    await expect(followAllVfs.stat("/workspace/cp.testdir2/dir_symlink")).resolves.toMatchObject({ kind: "directory" });
    await expect(followAllVfs.stat("/workspace/cp.testdir2/dir/file_symlink")).resolves.toMatchObject({ kind: "file" });
  });
});

function createCpTestVfs() {
  return createMemoryVFS({
    files: {
      "/workspace/cp.testdir/file": "",
      "/workspace/cp.testdir/dir/file": "",
    },
    dirs: ["/workspace/cp.testdir2"],
    symlinks: {
      "/workspace/cp.testdir/file_symlink": "file",
      "/workspace/cp.testdir/dir/file_symlink": "file",
      "/workspace/cp.testdir/dir_symlink": "dir",
    },
  });
}
