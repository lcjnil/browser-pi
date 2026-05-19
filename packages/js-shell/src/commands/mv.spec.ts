import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("mv busybox compatibility", () => {
  it("mv/mv-moves-empty-file, small-file, large-file, file, and removes-source-file", async () => {
    const large = "\0".repeat(10 * 1024) + "x";
    const vfs = createMemoryVFS({
      files: {
        "/workspace/empty": "",
        "/workspace/small": "I WANT\n",
        "/workspace/large": large,
        "/workspace/plain": "plain\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox mv empty empty.moved")).resolves.toMatchObject({ exitCode: 0 });
    await expect(shell.exec("busybox mv small small.moved")).resolves.toMatchObject({ exitCode: 0 });
    await expect(shell.exec("busybox mv large large.moved")).resolves.toMatchObject({ exitCode: 0 });
    await expect(shell.exec("busybox mv plain plain.moved")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.exists("/workspace/empty")).resolves.toBe(false);
    await expect(vfs.readText("/workspace/empty.moved")).resolves.toBe("");
    await expect(vfs.exists("/workspace/small")).resolves.toBe(false);
    await expect(vfs.readText("/workspace/small.moved")).resolves.toBe("I WANT\n");
    await expect(vfs.exists("/workspace/large")).resolves.toBe(false);
    await expect(vfs.readFile("/workspace/large.moved")).resolves.toEqual(new TextEncoder().encode(large));
    await expect(vfs.exists("/workspace/plain")).resolves.toBe(false);
    await expect(vfs.readText("/workspace/plain.moved")).resolves.toBe("plain\n");
  });

  it("mv/mv-files-to-dir moves files, symlinks, and directories into a directory", async () => {
    const vfs = createMoveFixture();
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox mv file1 file2 link1 dir1 there")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.readText("/workspace/there/file1")).resolves.toBe("file number one\n");
    await expect(vfs.readText("/workspace/there/file2")).resolves.toBe("file number two\n");
    await expect(vfs.stat("/workspace/there/dir1/file3")).resolves.toMatchObject({ kind: "file" });
    await expect(vfs.stat("/workspace/there/link1")).resolves.toMatchObject({ kind: "symlink" });
    await expect(vfs.readlink("/workspace/there/link1")).resolves.toBe("file2");

    await expect(vfs.exists("/workspace/file1")).resolves.toBe(false);
    await expect(vfs.exists("/workspace/file2")).resolves.toBe(false);
    await expect(vfs.exists("/workspace/link1")).resolves.toBe(false);
    await expect(vfs.exists("/workspace/dir1/file3")).resolves.toBe(false);
  });

  it("mv/mv-files-to-dir-2 supports -t target directory form", async () => {
    const vfs = createMoveFixture();
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox mv -t there file1 file2 link1 dir1")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.readText("/workspace/there/file1")).resolves.toBe("file number one\n");
    await expect(vfs.readText("/workspace/there/file2")).resolves.toBe("file number two\n");
    await expect(vfs.stat("/workspace/there/dir1/file3")).resolves.toMatchObject({ kind: "file" });
    await expect(vfs.stat("/workspace/there/link1")).resolves.toMatchObject({ kind: "symlink" });
    await expect(vfs.readlink("/workspace/there/link1")).resolves.toBe("file2");
  });

  it("mv/mv-follows-links, mv-moves-symlinks, and mv-preserves-links move the symlink itself", async () => {
    const vfs = createMemoryVFS({
      files: { "/workspace/foo": "" },
      symlinks: { "/workspace/bar": "foo" },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox mv bar baz")).resolves.toMatchObject({ exitCode: 0 });

    await expect(vfs.stat("/workspace/foo")).resolves.toMatchObject({ kind: "file" });
    await expect(vfs.exists("/workspace/bar")).resolves.toBe(false);
    await expect(vfs.stat("/workspace/baz")).resolves.toMatchObject({ kind: "symlink" });
    await expect(vfs.readlink("/workspace/baz")).resolves.toBe("foo");
    await expect(vfs.readFile("/workspace/baz")).resolves.toEqual(new Uint8Array());
  });

  it("mv/mv-refuses-mv-dir-to-subdir rejects moving a directory under itself", async () => {
    const vfs = createMoveFixture();
    const shell = createJsShell({ vfs });
    await shell.exec("busybox mv file1 file2 link1 dir1 there");

    await expect(shell.exec("busybox mv there there/dir1")).resolves.toMatchObject({ exitCode: 1 });
    await expect(vfs.stat("/workspace/there/dir1/file3")).resolves.toMatchObject({ kind: "file" });
    await expect(vfs.exists("/workspace/there/dir1/there")).resolves.toBe(false);
  });
});

function createMoveFixture() {
  return createMemoryVFS({
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
}
