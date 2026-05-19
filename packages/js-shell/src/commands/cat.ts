import type { ShellCommandContext, ShellResult } from "../types";
import { ok, resolvePath } from "./helpers";

export async function cat(ctx: ShellCommandContext): Promise<ShellResult> {
  const showEnds = ctx.args.some((arg) => arg.includes("e"));
  const numberAll = ctx.args.some((arg) => arg.includes("n"));
  const numberNonBlank = ctx.args.some((arg) => arg.includes("b"));
  const paths = ctx.args.filter((arg) => arg === "-" || !arg.startsWith("-"));
  if (!paths.length) return ok(formatCat(ctx.stdin, { showEnds, numberAll, numberNonBlank }));
  let out = "";
  for (const path of paths) {
    out += path === "-" ? ctx.stdin : await ctx.vfs.readText(resolvePath(ctx, path));
  }
  return ok(formatCat(out, { showEnds, numberAll, numberNonBlank }));
}

function formatCat(text: string, options: { showEnds: boolean; numberAll: boolean; numberNonBlank: boolean }): string {
  let lineNo = 1;
  const lines = text.split("\n");
  const hasFinalEmpty = lines[lines.length - 1] === "";
  if (hasFinalEmpty) lines.pop();
  const out = lines.map((line) => {
    const numbered = options.numberAll || (options.numberNonBlank && line.length > 0);
    const prefix = numbered ? `${String(lineNo++).padStart(6)}\t` : "";
    if (!numbered && options.numberNonBlank && line.length === 0) return options.showEnds ? "$" : "";
    return `${prefix}${line}${options.showEnds ? "$" : ""}`;
  }).join("\n");
  return out + (hasFinalEmpty || text ? "\n" : "");
}
