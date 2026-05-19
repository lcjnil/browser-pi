import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

const input = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";

describe("head busybox compatibility", () => {
  it("head.tests file and -n cases", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/head.input": input } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("head head.input")).resolves.toMatchObject({
      stdout: "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\n",
    });
    await expect(shell.exec("head -n 2 head.input")).resolves.toMatchObject({ stdout: "line 1\nline 2\n" });
    await expect(shell.exec("head -n -9 head.input")).resolves.toMatchObject({ stdout: "line 1\nline 2\nline 3\n" });
  });
});
