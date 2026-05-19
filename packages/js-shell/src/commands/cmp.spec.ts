import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("cmp busybox compatibility", () => {
  it("cmp/cmp-detects-difference", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/foo": "foo\n",
        "/workspace/bar": "bar\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cmp -s foo bar")).resolves.toMatchObject({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });
  });
});
