import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("pwd busybox compatibility", () => {
  it("pwd/pwd-prints-working-directory", async () => {
    await expect(createJsShell({ cwd: "/workspace/sub" }).exec("busybox pwd")).resolves.toMatchObject({
      stdout: "/workspace/sub\n",
    });
  });
});
