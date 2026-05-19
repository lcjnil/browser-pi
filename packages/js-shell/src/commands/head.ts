import type { ShellCommandContext, ShellResult } from "../types";
import { ok, resolvePath, splitLines, valueAfter } from "./helpers";

export async function head(ctx: ShellCommandContext): Promise<ShellResult> {
  const files = operands(ctx.args);
  const input = files.length ? await ctx.vfs.readText(resolvePath(ctx, files[0])) : ctx.stdin;
  const spec = valueAfter(ctx.args, "-n") ?? ctx.args.find((arg) => /^-\d+$/.test(arg))?.slice(1) ?? "10";
  const count = Number(spec);
  const all = splitLines(input);
  const lines = count < 0 ? all.slice(0, Math.max(0, all.length + count)) : all.slice(0, count);
  return ok(lines.join("\n") + (lines.length ? "\n" : ""));
}

function operands(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n") {
      i++;
      continue;
    }
    if (args[i].startsWith("-")) continue;
    out.push(args[i]);
  }
  return out;
}
