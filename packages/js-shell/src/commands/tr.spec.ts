import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("tr busybox compatibility", () => {
  it("tr ranges and bracket handling", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox tr '[q-z]' '_Q-Z+'", { stdin: "[qwe]" })).resolves.toMatchObject({ stdout: "_QWe+" });
    await expect(shell.exec("busybox tr a-z A-Z", { stdin: "abc\n" })).resolves.toMatchObject({ stdout: "ABC\n" });
  });

  it("tr delete and complement", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox tr -d aeiou", { stdin: "testing\n" })).resolves.toMatchObject({ stdout: "tstng\n" });
    await expect(shell.exec("busybox tr -cd '[0-9A-F]'", { stdin: "19AFH\n" })).resolves.toMatchObject({ stdout: "19AF" });
    await expect(shell.exec("busybox tr -cd '[:xdigit:]'", { stdin: "19AFH\n" })).resolves.toMatchObject({ stdout: "19AF" });
  });
});
