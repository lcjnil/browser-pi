import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

const input = "one\ntwo\nthree\nthree\nthree\n";

describe("grep busybox compatibility", () => {
  it("grep stdin, dash, file, no trailing newline, and two files", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/input": input,
        "/workspace/bug": "bug",
        "/workspace/empty": "",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox grep two", { stdin: input })).resolves.toMatchObject({ stdout: "two\n" });
    await expect(shell.exec("busybox grep two -", { stdin: input })).resolves.toMatchObject({ stdout: "two\n" });
    await expect(shell.exec("busybox grep two input")).resolves.toMatchObject({ stdout: "two\n" });
    await expect(shell.exec("busybox grep bug bug")).resolves.toMatchObject({ stdout: "bug\n" });
    await expect(shell.exec("busybox grep two input empty")).resolves.toMatchObject({ stdout: "input:two\n" });
    await expect(shell.exec("busybox grep two - input", { stdin: "one\ntwo\ntoo\nthree\nthree\n" })).resolves.toMatchObject({
      stdout: "(standard input):two\ninput:two\n",
    });
  });

  it("grep exit status, missing files, quiet, and silent", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/input": input } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox grep nonexistent")).resolves.toMatchObject({ exitCode: 1 });
    await expect(shell.exec("busybox grep two - nonexistent", { stdin: "one\ntwo\ntwo\n" })).resolves.toMatchObject({
      exitCode: 2,
      stdout: "(standard input):two\n(standard input):two\n",
    });
    await expect(shell.exec("busybox grep -q two - nonexistent", { stdin: "one\ntwo\n" })).resolves.toMatchObject({ exitCode: 0, stdout: "" });
    await expect(shell.exec("busybox grep -s nomatch nonexistent")).resolves.toMatchObject({ exitCode: 2, stdout: "" });
  });

  it("grep pattern options", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/input": "one\ntwo\nfoo\nFOO\nfoop foo\nwordword\nbword,word\n",
        "/workspace/patterns": "tw.\nthr\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox grep -e one -e two input")).resolves.toMatchObject({ stdout: "one\ntwo\n" });
    await expect(shell.exec("busybox grep -F -i foo input")).resolves.toMatchObject({ stdout: "foo\nFOO\nfoop foo\n" });
    await expect(shell.exec("busybox grep -f patterns input")).resolves.toMatchObject({ stdout: "two\n" });
    await expect(shell.exec("busybox grep -x foo input")).resolves.toMatchObject({ stdout: "foo\n" });
    await expect(shell.exec("busybox grep -L qwe input")).resolves.toMatchObject({ stdout: "input\n" });
    await expect(shell.exec("busybox grep -w word input")).resolves.toMatchObject({ stdout: "bword,word\n" });
  });

  it("grep extended, only matching, invert, and recursive", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/grep.testdir/foo/file": "bar\n",
        "/workspace/input": "foo\nbar\nbaz\nfoo12\nbar34\nfoo|bar\n",
      },
    });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox grep -E fo+", { stdin: "b\ar\nfoo\nbaz" })).resolves.toMatchObject({ stdout: "foo\n" });
    await expect(shell.exec("busybox grep 'foo|bar' input")).resolves.toMatchObject({ stdout: "foo|bar\n" });
    await expect(shell.exec("busybox grep -E 'foo|bar' input")).resolves.toMatchObject({
      stdout: "foo\nbar\nfoo12\nbar34\nfoo|bar\n",
    });
    await expect(shell.exec("busybox grep -E '^(foo|bar)[[:digit:]]+$' input")).resolves.toMatchObject({
      stdout: "foo12\nbar34\n",
    });
    await expect(shell.exec("busybox grep -E -o '([[:xdigit:]]{2}[:-]){5}[[:xdigit:]]{2}'", {
      stdin: "00:19:3E:00:AA:5E 00:1D:60:3D:3A:FB\n",
    })).resolves.toMatchObject({ stdout: "00:19:3E:00:AA:5E\n00:1D:60:3D:3A:FB\n" });
    await expect(shell.exec("busybox grep -Fv 'foo\nbar'", { stdin: "foo\nbar\nbaz\n" })).resolves.toMatchObject({ stdout: "baz\n" });
    await expect(shell.exec("busybox grep -r . grep.testdir")).resolves.toMatchObject({ stdout: "grep.testdir/foo/file:bar\n" });
  });
});
