import type { ShellCommandContext, ShellResult } from "../types";
import { ok, resolvePath } from "./helpers";

export async function sort(ctx: ShellCommandContext): Promise<ShellResult> {
  const files = sortOperands(ctx.args);
  const input = files.length ? (await Promise.all(files.map((file) => ctx.vfs.readText(resolvePath(ctx, file))))).join("") : ctx.stdin;
  const optionArgs = ctx.args.filter((arg) => arg.startsWith("-"));
  const numeric = optionArgs.some((arg) => arg.includes("n"));
  const reverse = optionArgs.some((arg) => arg.includes("r"));
  const unique = optionArgs.some((arg) => arg.includes("u"));
  const outputFile = valueAfterJoined(ctx.args, "-o");
  let lines = splitRecords(input);
  lines.sort((a, b) => numeric ? Number(a) - Number(b) : a.localeCompare(b));
  if (reverse) lines.reverse();
  if (unique) lines = lines.filter((line, index) => index === 0 || line !== lines[index - 1]);
  const output = lines.join("\n") + (lines.length ? "\n" : "");
  if (outputFile) {
    await ctx.vfs.writeText(resolvePath(ctx, outputFile), output);
    return ok("");
  }
  return ok(output);
}

function sortOperands(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["-o", "-k", "-t"].includes(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("-")) continue;
    out.push(arg);
  }
  return out;
}

function splitRecords(text: string): string[] {
  return text.split("\n").filter((line) => line.length > 0);
}

function valueAfterJoined(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
