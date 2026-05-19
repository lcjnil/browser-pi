import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("xargs busybox compatibility", () => {
  it("xargs eof marker behavior and default echo", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox xargs -E _", { stdin: "a\n_\nb\n" })).resolves.toMatchObject({ stdout: "a\n" });
    await expect(shell.exec("busybox xargs -E ''", { stdin: "a\n_\nb\n" })).resolves.toMatchObject({ stdout: "a _ b\n" });
    await expect(shell.exec("busybox xargs", { stdin: "a\n_\nb\n" })).resolves.toMatchObject({ stdout: "a _ b\n" });
  });

  it("xargs -n chunks", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox xargs -n1 echo", { stdin: "1 2 3 4 5\n" })).resolves.toMatchObject({ stdout: "1\n2\n3\n4\n5\n" });
    await expect(shell.exec("busybox xargs -n2 echo", { stdin: "1 2 3 4 5\n" })).resolves.toMatchObject({ stdout: "1 2\n3 4\n5\n" });
  });

  it("xargs -0", async () => {
    await expect(createJsShell().exec("busybox xargs -0 echo", { stdin: "a\0b\0" })).resolves.toMatchObject({
      stdout: "a b\n",
    });
  });
});
