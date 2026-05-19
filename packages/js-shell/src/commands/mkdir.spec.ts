import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("mkdir busybox compatibility", () => {
  it("mkdir/mkdir-makes-a-directory and mkdir-makes-parent-directories", async () => {
    const vfs = createMemoryVFS();
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox mkdir foo")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.stat("/workspace/foo")).resolves.toMatchObject({ kind: "directory" });

    await expect(shell.exec("busybox mkdir -p foo/bar")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.stat("/workspace/foo/bar")).resolves.toMatchObject({ kind: "directory" });
  });
});
