import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

const input = "one\ntwo\ntwo\nthree\nthree\nthree\n";

describe("uniq busybox compatibility", () => {
  it("uniq stdin, dash, file, and output file", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/input": input } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox uniq", { stdin: input })).resolves.toMatchObject({ stdout: "one\ntwo\nthree\n" });
    await expect(shell.exec("busybox uniq -", { stdin: input })).resolves.toMatchObject({ stdout: "one\ntwo\nthree\n" });
    await expect(shell.exec("busybox uniq input")).resolves.toMatchObject({ stdout: "one\ntwo\nthree\n" });
    await expect(shell.exec("busybox uniq input actual")).resolves.toMatchObject({ stdout: "" });
    await expect(vfs.readText("/workspace/actual")).resolves.toBe("one\ntwo\nthree\n");
  });

  it("uniq options", async () => {
    const shell = createJsShell();
    await expect(shell.exec("busybox uniq -c", { stdin: input })).resolves.toMatchObject({ stdout: "      1 one\n      2 two\n      3 three\n" });
    await expect(shell.exec("busybox uniq -d", { stdin: input })).resolves.toMatchObject({ stdout: "two\nthree\n" });
    await expect(shell.exec("busybox uniq -d -u", { stdin: input })).resolves.toMatchObject({ stdout: "" });
    await expect(shell.exec("busybox uniq -w 2", { stdin: "cc1\ncc2\ncc3\n" })).resolves.toMatchObject({ stdout: "cc1\n" });
  });
});
