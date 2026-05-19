import type { ShellCommandContext, ShellResult } from "../types";
import { ok } from "./helpers";

export function env(ctx: ShellCommandContext): ShellResult {
  return ok(`${Object.entries(ctx.env).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
}
