import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("wc busybox compatibility", () => {
  const input = "i'm a little teapot\n";

  it("wc/wc-counts-all", async () => {
    await expect(createJsShell().exec("busybox wc", { stdin: input })).resolves.toMatchObject({
      stdout: "      1       4      20\n",
    });
  });

  it("wc single counters", async () => {
    const shell = createJsShell();
    await expect(shell.exec("busybox wc -c", { stdin: input })).resolves.toMatchObject({ stdout: "     20\n" });
    await expect(shell.exec("busybox wc -l", { stdin: input })).resolves.toMatchObject({ stdout: "      1\n" });
    await expect(shell.exec("busybox wc -w", { stdin: input })).resolves.toMatchObject({ stdout: "      4\n" });
    await expect(shell.exec("busybox wc -L", { stdin: input })).resolves.toMatchObject({ stdout: "     19\n" });
  });
});
