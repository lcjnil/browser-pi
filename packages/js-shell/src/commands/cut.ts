import type { ShellCommandContext, ShellResult } from "../types";
import { failed, ok, resolvePath, valueAfter } from "./helpers";

export async function cut(ctx: ShellCommandContext): Promise<ShellResult> {
  const mode = ctx.args.includes("-b") || ctx.args.some((arg) => arg.startsWith("-b")) ? "chars"
    : ctx.args.includes("-c") || ctx.args.some((arg) => arg.startsWith("-c")) ? "chars" : "fields";
  const spec = optionValue(ctx.args, "-b") ?? optionValue(ctx.args, "-c") ?? optionValue(ctx.args, "-f") ?? "1";
  const ranges = parseCutRanges(spec);
  if (!ranges) return failed();
  const delimiter = optionValue(ctx.args, "-d") ?? "\t";
  const separatedOnly = ctx.args.includes("-s");
  const operands = cutOperands(ctx.args, spec, delimiter);
  const chunks = operands.length
    ? await Promise.all(operands.map((path) => path === "-" ? ctx.stdin : ctx.vfs.readText(resolvePath(ctx, path))))
    : [ctx.stdin];
  const input = chunks.join("");
  const lines = input.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const out = lines.map((line) => {
    if (mode === "chars") return selectByRanges([...line], ranges).join("");
    if (!line.includes(delimiter)) return separatedOnly ? undefined : line;
    return selectByRanges(line.split(delimiter), ranges).join(delimiter);
  }).filter((line): line is string => line !== undefined).join("\n");
  return ok(out ? `${out}\n` : "");
}

function cutOperands(args: string[], spec: string, delimiter: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["-b", "-c", "-f", "-d"].includes(arg)) {
      i++;
      continue;
    }
    if (/^-[bcfd]/.test(arg) && arg.length > 2) continue;
    if (arg.startsWith("-") && arg !== "-") continue;
    if (arg === spec || arg === delimiter) continue;
    out.push(arg);
  }
  return out;
}

interface CutRange {
  start: number;
  end: number;
}

function parseCutRanges(spec: string): CutRange[] | undefined {
  const ranges: CutRange[] = [];
  for (const part of spec.split(",")) {
    const match = part.match(/^(\d*)-?(\d*)$/);
    if (!match) return undefined;
    const start = match[1] ? Number(match[1]) : 1;
    const end = match[2] ? Number(match[2]) : part.includes("-") ? Number.MAX_SAFE_INTEGER : start;
    if (start > end) return undefined;
    ranges.push({ start, end });
  }
  return ranges;
}

function selectByRanges<T>(items: T[], ranges: CutRange[]): T[] {
  const selected: T[] = [];
  const seen = new Set<number>();
  for (const range of ranges) {
    for (let index = range.start; index <= Math.min(range.end, items.length); index++) {
      if (seen.has(index)) continue;
      seen.add(index);
      selected.push(items[index - 1]);
    }
  }
  return selected;
}

function optionValue(args: string[], flag: string): string | undefined {
  const compact = args.find((arg) => arg.startsWith(flag) && arg.length > flag.length);
  if (compact) return compact.slice(flag.length);
  return valueAfter(args, flag);
}
