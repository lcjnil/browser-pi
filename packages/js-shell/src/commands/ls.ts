import type { ShellCommandContext, ShellResult } from "../types";
import { entryFor, modeString, ok, optionless, resolvePath } from "./helpers";
import { dirname, normalizePath } from "../path";

export async function ls(ctx: ShellCommandContext): Promise<ShellResult> {
  const optionArgs = ctx.args.filter((arg) => arg.startsWith("-"));
  const long = optionArgs.some((arg) => arg.includes("l"));
  const sizes = optionArgs.some((arg) => arg.includes("s"));
  const human = optionArgs.some((arg) => arg.includes("h"));
  const args = optionless(ctx.args);
  const target = resolvePath(ctx, args[0] ?? ".");
  const stat = await ctx.vfs.stat(target);
  const displayTarget = stat.kind === "symlink" ? await followSymlink(ctx, target) : target;
  const displayStat = await ctx.vfs.stat(displayTarget);
  const entries = (displayStat.kind === "directory" ? await ctx.vfs.listDir(displayTarget) : [await entryFor(ctx.vfs, target)])
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));
  const text = await Promise.all(entries.map(async (entry) => {
    const size = human ? humanSize(entry.size) : String(entry.size);
    if (long) return `${modeString(entry.kind, entry.mode)} ${size.padStart(6)} ${entry.name}${entry.kind === "symlink" ? ` -> ${await ctx.vfs.readlink(entry.path)}` : ""}`;
    if (sizes) return `${blocks(entry.size).toString().padStart(4)} ${entry.name}`;
    return entry.name;
  }));
  const output = text.join("\n");
  return ok(output + (output ? "\n" : ""));
}

async function followSymlink(ctx: ShellCommandContext, path: string): Promise<string> {
  const target = await ctx.vfs.readlink(path);
  const resolved = normalizePath(target, dirname(path));
  try {
    const stat = await ctx.vfs.stat(resolved);
    return stat.kind === "directory" ? resolved : path;
  } catch {
    return path;
  }
}

function blocks(size: number): number {
  return size === 0 ? 0 : Math.max(1, Math.ceil(size / 1024));
}

function humanSize(size: number): string {
  if (size < 1024) return String(size);
  const units = ["K", "M", "G"];
  let value = size / 1024;
  let unit = units.shift() ?? "K";
  while (value >= 1024 && units.length) {
    value /= 1024;
    unit = units.shift() ?? unit;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}
