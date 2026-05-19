import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("test busybox compatibility", () => {
  const cases: Array<[string, number]> = [
    ["busybox test", 1],
    ["busybox test ''", 1],
    ["busybox test !", 0],
    ["busybox test a", 0],
    ["busybox test --help", 0],
    ["busybox test -f", 0],
    ["busybox test ! -f", 1],
    ["busybox test a = a", 0],
    ["busybox test -lt = -gt", 1],
    ["busybox test a -a !", 0],
    ["busybox test -f = a -o b", 0],
    ["busybox test ! a = b -a ! c = c", 1],
    ["busybox test ! a = b -a ! c = d", 0],
    ["busybox test '!' = '!'", 0],
    ["busybox test '(' = '('", 0],
    ["busybox test '!' '!' = '!'", 1],
    ["busybox test '!' '(' = '('", 1],
  ];

  for (const [command, exitCode] of cases) {
    it(`test.tests ${command}`, async () => {
      await expect(createJsShell().exec(command)).resolves.toMatchObject({ exitCode, stdout: "", stderr: "" });
    });
  }
});
