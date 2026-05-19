import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("sort busybox compatibility", () => {
  it("sort basic, stdin, numeric, and reverse", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/input": "c\na\nb\n",
        "/workspace/numbers": "3\n1\n010\n",
        "/workspace/words": "point\nwook\npabst\naargh\nwalrus\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox sort input")).resolves.toMatchObject({ stdout: "a\nb\nc\n" });
    await expect(shell.exec("busybox sort", { stdin: "b\na\nc\n" })).resolves.toMatchObject({ stdout: "a\nb\nc\n" });
    await expect(shell.exec("busybox sort -n numbers")).resolves.toMatchObject({ stdout: "1\n3\n010\n" });
    await expect(shell.exec("busybox sort -r words")).resolves.toMatchObject({ stdout: "wook\nwalrus\npoint\npabst\naargh\n" });
  });

  it("sort file in place", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/input": "222\n111\n" } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox sort -o input input")).resolves.toMatchObject({ exitCode: 0 });
    await expect(vfs.readText("/workspace/input")).resolves.toBe("111\n222\n");
  });
});
