import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("rm busybox compatibility", () => {
  it("rm/rm-removes-file", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/foo": "" } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox rm foo")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.exists("/workspace/foo")).resolves.toBe(false);
  });

  it("rm reports missing operands and missing files unless forced", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox rm")).resolves.toMatchObject({ exitCode: 1, stdout: "" });
    await expect(shell.exec("busybox rm missing")).resolves.toMatchObject({
      exitCode: 1,
      stdout: "",
      stderr: "rm: can't remove 'missing': No such file or directory\n",
    });
    await expect(shell.exec("busybox rm -f missing")).resolves.toMatchObject({ exitCode: 0, stdout: "", stderr: "" });
  });

  it("rm refuses directories without -r and removes recursively with -r/-R/-rf", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/dir/file": "hello\n",
        "/workspace/dir/sub/nested": "nested\n",
        "/workspace/other/file": "other\n",
        "/workspace/third/file": "third\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox rm dir")).resolves.toMatchObject({
      exitCode: 1,
      stderr: "rm: can't remove 'dir': Is a directory\n",
    });
    await expect(vfs.exists("/workspace/dir/file")).resolves.toBe(true);

    await expect(shell.exec("busybox rm -r dir")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.exists("/workspace/dir")).resolves.toBe(false);

    await expect(shell.exec("busybox rm -R other")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.exists("/workspace/other")).resolves.toBe(false);

    await expect(shell.exec("busybox rm -rf third missing")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.exists("/workspace/third")).resolves.toBe(false);
  });

  it("rm removes symlinks without removing the target", async () => {
    const vfs = createMemoryVFS({
      files: { "/workspace/target": "target\n" },
      symlinks: { "/workspace/link": "target" },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox rm link")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.exists("/workspace/link")).resolves.toBe(false);
    await expect(vfs.readText("/workspace/target")).resolves.toBe("target\n");
  });
});
