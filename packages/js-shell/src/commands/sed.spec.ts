import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

describe("sed busybox compatibility", () => {
  it("sed no files, explicit stdin, empty script, and repeated stdin", async () => {
    const shell = createJsShell();

    await expect(shell.exec('busybox sed ""', { stdin: "hello\n" })).resolves.toMatchObject({ stdout: "hello\n" });
    await expect(shell.exec('busybox sed "" -', { stdin: "hello\n" })).resolves.toMatchObject({ stdout: "hello\n" });
    await expect(shell.exec('busybox sed "" - -', { stdin: "hello" })).resolves.toMatchObject({ stdout: "hello" });
  });

  it("sed supports -n, multiple -e scripts, and substitution print flag", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox sed -n -e s/foo/bar/ -e s/bar/baz/", { stdin: "foo\n" })).resolves.toMatchObject({ stdout: "" });
    await expect(shell.exec("busybox sed -e s/foo/bar/p -e s/bar/baz/p", { stdin: "foo\n" })).resolves.toMatchObject({
      stdout: "bar\nbaz\nbaz\n",
    });
    await expect(shell.exec("busybox sed -ne s/abc/def/p", { stdin: "abc\n" })).resolves.toMatchObject({ stdout: "def\n" });
  });

  it("sed supports substitution delimiters, global replacements, chains, tabs, and numeric occurrence", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox sed 's/z*//g'", { stdin: "string\n" })).resolves.toMatchObject({ stdout: "string\n" });
    await expect(shell.exec("busybox sed -e 's woo boing '", { stdin: "woo\n" })).resolves.toMatchObject({ stdout: "boing\n" });
    await expect(shell.exec("busybox sed -e s/foo/bar/ -e s/bar/baz/", { stdin: "foo\n" })).resolves.toMatchObject({ stdout: "baz\n" });
    await expect(shell.exec("busybox sed -e 's@[@]@@'", { stdin: "one@two" })).resolves.toMatchObject({ stdout: "onetwo" });
    await expect(shell.exec("busybox sed 's/\\t/ /'", { stdin: "one\ttwo" })).resolves.toMatchObject({ stdout: "one two" });
    await expect(shell.exec("busybox sed -e 's/a/b/2; s/a/c/g'", { stdin: "aa\n" })).resolves.toMatchObject({ stdout: "cb\n" });
  });

  it("sed supports addresses, delete, print, append, and insert", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox sed -e '1 d'", { stdin: "first\nsecond\n" })).resolves.toMatchObject({ stdout: "second\n" });
    await expect(shell.exec("busybox sed -n '1d;1,3p'", { stdin: "first\nsecond\nthird\n" })).resolves.toMatchObject({ stdout: "" });
    await expect(shell.exec("busybox sed -e '/ook/d;s/oot/ping/p;i woot'", { stdin: "ook\n" })).resolves.toMatchObject({ stdout: "" });
    await expect(shell.exec("busybox sed -e '/woot/a woo' -", { stdin: "woot" })).resolves.toMatchObject({ stdout: "woot\nwoo\n" });
    await expect(shell.exec("busybox sed -e '/woot/i woo' -", { stdin: "woot" })).resolves.toMatchObject({ stdout: "woo\nwoot" });
  });

  it("sed reads multiple files, preserves missing trailing newline, and supports -i", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/input": "woo\n",
        "/workspace/plain": "one",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox sed -e 's/woo/bang/' input -", { stdin: "woo" })).resolves.toMatchObject({ stdout: "bang\nbang" });
    await expect(shell.exec("busybox sed -e 's/nohit//' plain -", { stdin: "two" })).resolves.toMatchObject({ stdout: "onetwo" });
    await expect(shell.exec("busybox sed -i -e 's/woo/bang/' input")).resolves.toMatchObject({ exitCode: 0, stdout: "" });
    await expect(vfs.readText("/workspace/input")).resolves.toBe("bang\n");
  });

  it("sed supports backrefs, ampersand replacement, escaped replacement ampersand, and last-line address", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox sed -e 's/xxx/[/'", { stdin: "xxx\n" })).resolves.toMatchObject({ stdout: "[\n" });
    await expect(shell.exec("busybox sed 's1\\(9\\)1X\\11'", { stdin: "9+8=17\n" })).resolves.toMatchObject({ stdout: "X1+8=17\n" });
    await expect(shell.exec("busybox sed 's&9&X\\&&'", { stdin: "9+8=17\n" })).resolves.toMatchObject({ stdout: "X&+8=17\n" });
    await expect(shell.exec("busybox sed '$p'", { stdin: "hello\nthere" })).resolves.toMatchObject({ stdout: "hello\ntherethere" });
  });
});
