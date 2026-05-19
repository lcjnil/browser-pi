import type { ShellCommandContext, ShellResult } from "../types";
import { failed, ok, optionless, resolvePath } from "./helpers";

export async function cmp(ctx: ShellCommandContext): Promise<ShellResult> {
  const [left, right] = optionless(ctx.args);
  const a = await ctx.vfs.readText(resolvePath(ctx, left));
  const b = await ctx.vfs.readText(resolvePath(ctx, right));
  const silent = ctx.args.includes("-s");
  if (a === b) return ok("");
  return silent ? failed() : { exitCode: 1, stdout: "", stderr: `${left} ${right} differ\n` };
}
