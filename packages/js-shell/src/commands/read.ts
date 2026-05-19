import type { ShellCommandContext, ShellResult } from "../types";
import { ok } from "./helpers";

export function read(ctx: ShellCommandContext): ShellResult {
  const name = ctx.args[0];
  if (name) ctx.env[name] = ctx.stdin.split("\n")[0] ?? "";
  return ok("");
}
