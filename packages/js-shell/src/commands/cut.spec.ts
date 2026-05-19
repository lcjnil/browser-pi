import { describe, expect, it } from "vitest";
import { createJsShell, createMemoryVFS } from "../index";

const abc = "one:two:three:four:five:six:seven\nalpha:beta:gamma:delta:epsilon:zeta:eta:theta:iota:kappa:lambda:mu\nthe quick brown fox jumps over the lazy dog\n";

describe("cut busybox compatibility", () => {
  it("cut stdin and multi-file handling", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/input": "the quick brown fox\n" } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cut -d ' ' -f2 - input", { stdin: "jumps over the lazy dog\n" })).resolves.toMatchObject({
      stdout: "over\nquick\n",
    });
  });

  it("cut character and byte ranges", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/input": abc } });
    const shell = createJsShell({ vfs });

    await expect(shell.exec("busybox cut -b 3,3,3 input")).resolves.toMatchObject({ stdout: "e\np\ne\n" });
    await expect(shell.exec("busybox cut -c 4-10 input")).resolves.toMatchObject({ stdout: ":two:th\nha:beta\n quick \n" });
    await expect(shell.exec("busybox cut -c 41- input")).resolves.toMatchObject({ stdout: "\ntheta:iota:kappa:lambda:mu\ndog\n" });
    await expect(shell.exec("busybox cut -c -3", { stdin: "abcd\n" })).resolves.toMatchObject({ stdout: "abc\n" });
    await expect(shell.exec("busybox cut -c 3-", { stdin: "abcd\n" })).resolves.toMatchObject({ stdout: "cd\n" });
  });

  it("cut fields and separated-only", async () => {
    const input = "406378:Sales:Itorre:Jan\n031762:Marketing:Nasium:Jim\n";
    const shell = createJsShell();

    await expect(shell.exec("busybox cut -d: -f3 -s", { stdin: input })).resolves.toMatchObject({ stdout: "Itorre\nNasium\n" });
    await expect(shell.exec("busybox cut -d ' ' -f3 -s", { stdin: input })).resolves.toMatchObject({ stdout: "" });
    await expect(shell.exec("busybox cut -d ':' -f 1-3", { stdin: "a::b\n" })).resolves.toMatchObject({ stdout: "a::b\n" });
  });
});
