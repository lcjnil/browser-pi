import type { ShellCommandContext, ShellResult } from "../types";
import { failed, ok, optionless, resolvePath } from "./helpers";

export async function ln(ctx: ShellCommandContext): Promise<ShellResult> {
  const symbolic = ctx.args.includes("-s");
  const force = ctx.args.includes("-f");
  const args = optionless(ctx.args);
  const target = resolvePath(ctx, args[1]);
  if (await ctx.vfs.exists(target)) {
    if (!force) return failed();
    await ctx.vfs.remove(target, { force: true, recursive: true });
  }
  if (symbolic) await ctx.vfs.symlink(args[0], target);
  else await ctx.vfs.writeFile(target, await ctx.vfs.readFile(resolvePath(ctx, args[0])));
  return ok("");
}
