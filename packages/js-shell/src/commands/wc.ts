import type { ShellCommandContext, ShellResult } from "../types";
import { ok, optionless, resolvePath } from "./helpers";

export async function wc(ctx: ShellCommandContext): Promise<ShellResult> {
  const files = optionless(ctx.args);
  const flags = ctx.args.filter((arg) => arg.startsWith("-")).join("");
  if (!files.length) return ok(formatWc(ctx.stdin, "", flags));
  let out = "";
  for (const file of files) out += formatWc(await ctx.vfs.readText(resolvePath(ctx, file)), file, flags);
  return ok(out);
}

function formatWc(text: string, label: string, flags: string): string {
  const lines = text.endsWith("\n") ? text.split("\n").length - 1 : text ? text.split("\n").length : 0;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const bytes = new TextEncoder().encode(text).byteLength;
  const longest = text.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
  const values: number[] = [];
  if (flags.includes("l")) values.push(lines);
  if (flags.includes("w")) values.push(words);
  if (flags.includes("c")) values.push(bytes);
  if (flags.includes("L")) values.push(longest);
  if (!values.length) values.push(lines, words, bytes);
  const prefix = values.map((value) => value.toString().padStart(7)).join(" ");
  return `${prefix}${label ? ` ${label}` : ""}\n`;
}
