import type { ShellCommandContext, ShellResult } from "../types";
import { ok, resolvePath } from "./helpers";

export function cd(ctx: ShellCommandContext): ShellResult {
  ctx.setCwd(resolvePath(ctx, ctx.args[0] ?? ctx.env.HOME ?? "/workspace"));
  return ok("");
}
