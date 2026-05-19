import type { ShellCommandContext, ShellResult } from "../types";
import { ok, optionless, resolvePath } from "./helpers";

export async function uniq(ctx: ShellCommandContext): Promise<ShellResult> {
  const operands = uniqOperands(ctx.args);
  const inputPath = operands[0] && operands[0] !== "-" ? operands[0] : undefined;
  const outputPath = operands[1] && operands[1] !== "-" ? operands[1] : undefined;
  const input = inputPath ? await ctx.vfs.readText(resolvePath(ctx, inputPath)) : ctx.stdin;
  const count = ctx.args.includes("-c");
  const dupsOnly = ctx.args.includes("-d");
  const uniqueOnly = ctx.args.includes("-u");
  const skipFields = numberOption(ctx.args, "-f");
  const skipChars = numberOption(ctx.args, "-s");
  const maxChars = numberOption(ctx.args, "-w");
  const lines = input.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const groups: Array<{ line: string; count: number }> = [];
  for (const line of lines) {
    const key = compareKey(line, skipFields, skipChars, maxChars);
    const last = groups[groups.length - 1];
    if (last && compareKey(last.line, skipFields, skipChars, maxChars) === key) last.count++;
    else groups.push({ line, count: 1 });
  }
  const selected = groups.filter((group) => {
    if (dupsOnly && uniqueOnly) return false;
    if (dupsOnly) return group.count > 1;
    if (uniqueOnly) return group.count === 1;
    return true;
  });
  const output = selected.map((group) => `${count ? `${String(group.count).padStart(7)} ` : ""}${group.line}`).join("\n") + (selected.length ? "\n" : "");
  if (outputPath) {
    await ctx.vfs.writeText(resolvePath(ctx, outputPath), output);
    return ok("");
  }
  return ok(output);
}

function uniqOperands(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["-f", "-s", "-w"].includes(arg)) {
      i++;
      continue;
    }
    if (/^-[fsw]\d+/.test(arg)) continue;
    if (arg.startsWith("-") && arg !== "-") continue;
    out.push(arg);
  }
  return out;
}

function numberOption(args: string[], flag: string): number {
  const compact = args.find((arg) => arg.startsWith(flag) && arg.length > flag.length);
  if (compact) return Number(compact.slice(flag.length));
  const index = args.indexOf(flag);
  return index >= 0 ? Number(args[index + 1] ?? 0) : 0;
}

function compareKey(line: string, skipFields: number, skipChars: number, maxChars: number): string {
  let key = line;
  for (let i = 0; i < skipFields; i++) key = key.replace(/^\s*\S+\s*/, "");
  key = key.slice(skipChars);
  return maxChars > 0 ? key.slice(0, maxChars) : key;
}
