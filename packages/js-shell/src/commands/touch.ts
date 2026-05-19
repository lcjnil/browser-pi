import type { ShellCommandContext, ShellResult } from "../types";
import { ok, optionless, resolvePath } from "./helpers";

export async function touch(ctx: ShellCommandContext): Promise<ShellResult> {
  const noCreate = ctx.args.includes("-c");
  const paths = operands(ctx.args);
  for (const path of paths) {
    const absolute = resolvePath(ctx, path);
    if (await ctx.vfs.exists(absolute)) await ctx.vfs.appendFile(absolute, "");
    else if (noCreate) continue;
    else await ctx.vfs.writeText(absolute, "");
  }
  return ok("");
}

function operands(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-t") {
      i++;
      continue;
    }
    if (args[i].startsWith("-")) continue;
    out.push(args[i]);
  }
  return out;
}
