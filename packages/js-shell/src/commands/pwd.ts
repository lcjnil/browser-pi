import type { ShellCommandContext, ShellResult } from "../types";
import { ok } from "./helpers";

export function pwd(ctx: ShellCommandContext): ShellResult {
  return ok(`${ctx.cwd}\n`);
}
