import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("echo busybox compatibility", () => {
  it("echo/echo-prints-argument(s), newline, dash, and non-options", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox echo fubar")).resolves.toMatchObject({ stdout: "fubar\n" });
    await expect(shell.exec("busybox echo foo bar")).resolves.toMatchObject({ stdout: "foo bar\n" });
    await expect(shell.exec("busybox echo word")).resolves.toMatchObject({ stdout: "word\n" });
    await expect(shell.exec("busybox echo -")).resolves.toMatchObject({ stdout: "-\n" });
    await expect(shell.exec("busybox echo -neEZ")).resolves.toMatchObject({ stdout: "-neEZ\n" });
  });

  it("echo/echo-does-not-print-newline", async () => {
    await expect(createJsShell().exec("busybox echo -n word")).resolves.toMatchObject({ stdout: "word" });
  });

  it("echo fancy escapes", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox echo -e -n 'msg\\n\\0'")).resolves.toMatchObject({ stdout: "msg\n\0" });
    await expect(shell.exec("busybox echo -ne '\\041z'")).resolves.toMatchObject({ stdout: "!z" });
    await expect(shell.exec("busybox echo -ne '\\0041z'")).resolves.toMatchObject({ stdout: "!z" });
    await expect(shell.exec("busybox echo -ne '\\41z'")).resolves.toMatchObject({ stdout: "!z" });

    const result = await shell.exec("busybox echo -ne '\\00041z'");
    expect([...result.stdout].map((char) => char.charCodeAt(0))).toEqual([4, 49, 122]);
  });
});
