import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("tail busybox compatibility", () => {
  it("tail/tail-works and tail/tail-n-works", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/input": "abc\ndef\n123\n" } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox tail -2 input")).resolves.toMatchObject({ stdout: "def\n123\n" });
    await expect(shell.exec("busybox tail -n 2 input")).resolves.toMatchObject({ stdout: "def\n123\n" });
  });

  it("tail.tests tail -c +N", async () => {
    const shell = createJsShell();

    await expect(shell.exec("tail -c +55", { stdin: "qw" })).resolves.toMatchObject({ exitCode: 0, stdout: "" });
    await expect(shell.exec("tail -c +3", { stdin: "abcdef" })).resolves.toMatchObject({ stdout: "cdef" });
  });
});
