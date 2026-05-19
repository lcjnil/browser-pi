import type { ShellCommandContext, ShellResult } from "../types";
import { displayPath, ok, resolvePath, valueAfter, walk } from "./helpers";
import { normalizePath } from "../path";

export async function find(ctx: ShellCommandContext): Promise<ShellResult> {
  const rootArg = findRootArg(ctx.args);
  const root = resolvePath(ctx, rootArg);
  const type = valueAfter(ctx.args, "-type");
  const name = valueAfter(ctx.args, "-name");
  const maxdepthRaw = valueAfter(ctx.args, "-maxdepth");
  const maxdepth = maxdepthRaw === undefined ? Number.POSITIVE_INFINITY : Number(maxdepthRaw);
  const execIndex = ctx.args.findIndex((arg) => arg === "-exec" || arg === "-ok");
  const execPlus = execIndex >= 0 && ctx.args[ctx.args.length - 1] === "+";
  const entries = (await walk(ctx.vfs, root, true)).filter((entry) => depth(root, entry.path) <= maxdepth);
  const filtered = entries.filter((entry) => {
    if (type === "f") return entry.kind === "file";
    if (type === "d") return entry.kind === "directory";
    if (type === "l") return entry.kind === "symlink";
    if (name && !matchName(name, rootArg, entry.path)) return false;
    return true;
  });
  if (execIndex >= 0) {
    const template = ctx.args.slice(execIndex + 1, ctx.args.findIndex((arg, index) => index > execIndex && (arg === ";" || arg === "+")));
    let exitCode = 0;
    let stderr = "";
    if (execPlus) {
      const command = template.flatMap((part) => part === "{}" ? filtered.map((entry) => displayPath(ctx.cwd, entry.path)) : [part]).join(" ");
      const result = await ctx.shell.exec(command, { cwd: ctx.cwd, env: ctx.env });
      exitCode = result.exitCode;
      stderr += result.stderr;
    } else {
      for (const entry of filtered) {
        const display = displayPath(ctx.cwd, entry.path);
        const command = template.map((part) => part === "{}" ? display : part).join(" ");
        if (ctx.args[execIndex] === "-ok") stderr += `${command.replace(` ${display}`, ` ${display}`)} ?`;
        const result = await ctx.shell.exec(command, { cwd: ctx.cwd, env: ctx.env });
        stderr += result.stderr;
      }
    }
    return { exitCode, stdout: "", stderr };
  }
  return ok(filtered.map((entry) => findDisplayPath(ctx.cwd, rootArg, entry.path)).join("\n") + (filtered.length ? "\n" : ""));
}

function findRootArg(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["-type", "-name", "-maxdepth", "-exec", "-ok"].includes(arg)) {
      if (arg === "-exec" || arg === "-ok") break;
      i++;
      continue;
    }
    if (!arg.startsWith("-")) return arg;
  }
  return ".";
}

function depth(root: string, path: string): number {
  const rel = path.slice(root.length).replace(/^\/+/, "");
  return rel ? rel.split("/").length : 0;
}

function matchName(pattern: string, rootArg: string, path: string): boolean {
  const normalizedRoot = normalizePath(rootArg, "/workspace");
  const isRoot = normalizePath(path, "/") === normalizePath(normalizedRoot, "/");
  const name = (rootArg === "/" || rootArg === "//" || (rootArg === ".///" && isRoot)) ? rootArg.replace(/\/+$/, "") || rootArg : path.split("/").filter(Boolean).pop() ?? path;
  const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  return regex.test(name);
}

function findDisplayPath(cwd: string, rootArg: string, path: string): string {
  if (rootArg === ".///" && path === normalizePath(rootArg, cwd)) return ".///";
  return displayPath(cwd, path);
}
