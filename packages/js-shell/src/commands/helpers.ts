import { basename, normalizePath, relativePath } from "../path";
import type { AsyncVFS, ShellCommandContext, ShellResult, VFSEntry } from "../types";

const encoder = new TextEncoder();

export function ok(stdout: string): ShellResult {
  return { exitCode: 0, stdout, stderr: "" };
}

export function failed(exitCode = 1): ShellResult {
  return { exitCode, stdout: "", stderr: "" };
}

export function resolvePath(ctx: ShellCommandContext, path: string): string {
  return normalizePath(path, ctx.cwd);
}

export function optionless(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("-"));
}

export function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export function displayPath(cwd: string, path: string): string {
  const relative = relativePath(cwd, path);
  return relative === "." ? "." : relative.startsWith("..") ? path : `./${relative}`;
}

export function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function parseRange(value: string): number[] {
  return value.split(",").flatMap((part) => {
    const [start, end] = part.split("-").map(Number);
    if (!end) return [start];
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
}

export async function walk(vfs: AsyncVFS, path: string, includeRoot = false): Promise<Array<{ path: string; kind: "file" | "directory" | "symlink" }>> {
  const stat = await vfs.stat(path);
  const entries: Array<{ path: string; kind: "file" | "directory" | "symlink" }> = includeRoot ? [{ path, kind: stat.kind }] : [];
  if (stat.kind !== "directory") return entries.length ? entries : [{ path, kind: stat.kind }];
  for (const entry of await vfs.listDir(path)) {
    entries.push({ path: entry.path, kind: entry.kind });
    if (entry.kind === "directory") entries.push(...await walk(vfs, entry.path));
  }
  return entries;
}

export async function entryFor(vfs: AsyncVFS, path: string): Promise<VFSEntry> {
  const stat = await vfs.stat(path);
  return { name: basename(path), path, kind: stat.kind, size: stat.size, mode: stat.mode, mtimeMs: stat.mtimeMs };
}

export function formatWc(text: string, label: string): string {
  const lines = text.endsWith("\n") ? text.split("\n").length - 1 : text ? text.split("\n").length : 0;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const bytes = encoder.encode(text).byteLength;
  return `${lines.toString().padStart(7)} ${words.toString().padStart(7)} ${bytes.toString().padStart(7)}${label ? ` ${label}` : ""}\n`;
}

export function modeString(kind: string, mode: number): string {
  const type = kind === "directory" ? "d" : kind === "symlink" ? "l" : "-";
  const bits = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001]
    .map((bit, index) => mode & bit ? "rwx"[index % 3] : "-").join("");
  return type + bits;
}
