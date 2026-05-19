import type { ShellCommandContext, ShellResult } from "../types";
import { ok, resolvePath, splitLines, valueAfter } from "./helpers";

export async function tail(ctx: ShellCommandContext): Promise<ShellResult> {
  const files = operands(ctx.args);
  const input = files.length ? await ctx.vfs.readText(resolvePath(ctx, files[0])) : ctx.stdin;
  const byteSpec = valueAfter(ctx.args, "-c");
  if (byteSpec?.startsWith("+")) {
    const start = Math.max(0, Number(byteSpec.slice(1)) - 1);
    return ok(input.slice(start));
  }
  const count = Number(valueAfter(ctx.args, "-n") ?? ctx.args.find((arg) => /^-\d+$/.test(arg))?.slice(1) ?? 10);
  const lines = splitLines(input);
  return ok(lines.slice(-count).join("\n") + (lines.length ? "\n" : ""));
}

function operands(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" || args[i] === "-c") {
      i++;
      continue;
    }
    if (args[i].startsWith("-")) continue;
    out.push(args[i]);
  }
  return out;
}
