import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("touch busybox compatibility", () => {
  it("touch/touch-creates-file", async () => {
    const vfs = createMemoryVFS();
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox touch foo")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.stat("/workspace/foo")).resolves.toMatchObject({ kind: "file" });
  });

  it("touch/touch-does-not-create-file", async () => {
    const vfs = createMemoryVFS();
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox touch -c foo")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.exists("/workspace/foo")).resolves.toBe(false);
  });

  it("touch/touch-touches-files-after-non-existent-file", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/bar": "bar\n" } });
    const before = (await vfs.stat("/workspace/bar")).mtimeMs;
    const shell = createJsShell({ vfs });

    await shell.exec("busybox touch -c foo bar");

    await expect(vfs.exists("/workspace/foo")).resolves.toBe(false);
    expect((await vfs.stat("/workspace/bar")).mtimeMs).toBeGreaterThanOrEqual(before);
  });
});
