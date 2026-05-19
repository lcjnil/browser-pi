import type { ShellCommandContext, ShellResult } from "../types";
import { ok } from "./helpers";

export function exportCommand(ctx: ShellCommandContext): ShellResult {
  for (const arg of ctx.args) {
    const [key, ...rest] = arg.split("=");
    if (rest.length) ctx.env[key] = rest.join("=");
  }
  return ok("");
}

export function unsetCommand(ctx: ShellCommandContext): ShellResult {
  for (const key of ctx.args) delete ctx.env[key];
  return ok("");
}

export function setCommand(): ShellResult {
  return ok("");
}

export function returnCommand(ctx: ShellCommandContext): ShellResult {
  return { exitCode: Number(ctx.args[0] ?? 0), stdout: "", stderr: "" };
}
