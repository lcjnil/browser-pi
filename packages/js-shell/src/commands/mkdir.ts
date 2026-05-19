import type { ShellCommandContext, ShellResult } from "../types";
import { ok, optionless, resolvePath } from "./helpers";

export async function mkdir(ctx: ShellCommandContext): Promise<ShellResult> {
  for (const path of optionless(ctx.args)) await ctx.vfs.mkdir(resolvePath(ctx, path), { recursive: ctx.args.includes("-p") });
  return ok("");
}
