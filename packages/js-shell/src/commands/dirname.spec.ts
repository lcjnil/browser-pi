import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("dirname busybox compatibility", () => {
  it("dirname directory cases", async () => {
    const shell = createJsShell();

    await expect(shell.exec("busybox dirname /foo/bar/baz")).resolves.toMatchObject({ stdout: "/foo/bar\n" });
    await expect(shell.exec("busybox dirname ''")).resolves.toMatchObject({ stdout: ".\n" });
    await expect(shell.exec("busybox dirname foo/bar///baz")).resolves.toMatchObject({ stdout: "foo/bar\n" });
    await expect(shell.exec("busybox dirname foo/bar/baz")).resolves.toMatchObject({ stdout: "foo/bar\n" });
    await expect(shell.exec("busybox dirname /")).resolves.toMatchObject({ stdout: "/\n" });
    await expect(shell.exec("busybox dirname foo")).resolves.toMatchObject({ stdout: ".\n" });
  });
});
