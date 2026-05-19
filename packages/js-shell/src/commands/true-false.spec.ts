import { describe, expect, it } from "vitest";
import { createJsShell } from "../index";

describe("true/false busybox compatibility", () => {
  it("true is silent and returns success", async () => {
    await expect(createJsShell().exec("busybox true")).resolves.toMatchObject({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  });

  it("false is silent and returns failure", async () => {
    await expect(createJsShell().exec("busybox false")).resolves.toMatchObject({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });
  });

  it("supports shell negation used by BusyBox true/false tests", async () => {
    await expect(createJsShell().exec("! busybox false")).resolves.toMatchObject({ exitCode: 0 });
  });
});
