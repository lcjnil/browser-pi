import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("printf busybox compatibility", () => {
  it("printf.tests escape stopping and repeated patterns", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox printf '\\c' foo")).resolves.toMatchObject({ stdout: "" });
    await expect(shell.exec("busybox printf '%s\\c' foo bar")).resolves.toMatchObject({ stdout: "foo" });
    await expect(shell.exec("busybox printf '%s\\n' foo '$HOME'")).resolves.toMatchObject({ stdout: "foo\n$HOME\n" });
    await expect(shell.exec("busybox printf '%b' 'a\\tb' 'c\\\\d\\n'")).resolves.toMatchObject({ stdout: "a\tbc\\d\n" });
  });

  it("printf.tests numeric and string conversions", async () => {
    const shell = createJsShell();

    await expect(shell.exec(`busybox printf '%d\\n' '"x' "'y" "'zTAIL"`)).resolves.toMatchObject({ stdout: "120\n121\n122\n" });
    await expect(shell.exec(`busybox printf '%s\\n' '"x' "'y" "'zTAIL"`)).resolves.toMatchObject({ stdout: "\"x\n'y\n'zTAIL\n" });
    await expect(shell.exec("busybox printf '%zd\\n' -5")).resolves.toMatchObject({ stdout: "-5\n" });
    await expect(shell.exec("busybox printf '%ld\\n' -5")).resolves.toMatchObject({ stdout: "-5\n" });
    await expect(shell.exec("busybox printf '%Ld\\n' -5")).resolves.toMatchObject({ stdout: "-5\n" });
    await expect(shell.exec("busybox printf '%%\\n'")).resolves.toMatchObject({ stdout: "%\n" });
  });

  it("printf.tests width and precision", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox printf '|%23.12f|\\n' 5.25")).resolves.toMatchObject({ stdout: "|         5.250000000000|\n" });
    await expect(shell.exec("busybox printf '|%*.*f|\\n' 23 12 5.25")).resolves.toMatchObject({ stdout: "|         5.250000000000|\n" });
    await expect(shell.exec("busybox printf '|%*f|\\n' -23 5.25")).resolves.toMatchObject({ stdout: "|5.250000               |\n" });
    await expect(shell.exec("busybox printf '|%.*f|\\n' -12 5.25")).resolves.toMatchObject({ stdout: "|5.250000|\n" });
  });

  it("printf.tests invalid numbers and formats", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox printf '%d\\n' 1 - 2 bad 3 123bad 4")).resolves.toMatchObject({
      exitCode: 1,
      stdout: "1\n0\n2\n0\n3\n123\n4\n",
    });
    await expect(shell.exec("busybox printf '%' a b c")).resolves.toMatchObject({
      exitCode: 1,
      stderr: "printf: %: invalid format\n",
    });
    await expect(shell.exec("busybox printf '%r' a b c")).resolves.toMatchObject({
      exitCode: 1,
      stderr: "printf: %r: invalid format\n",
    });
  });
});
