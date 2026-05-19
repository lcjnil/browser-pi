import type { ShellCommandContext, ShellResult } from "../types";
import { dirname, normalizePath } from "../path";
import { failed, ok, optionless, resolvePath } from "./helpers";

export async function readlink(ctx: ShellCommandContext): Promise<ShellResult> {
  const canonical = ctx.args.includes("-f");
  const path = optionless(ctx.args)[0];
  if (!path) return failed();
  if (canonical) {
    const resolved = await resolveCanonical(ctx, resolvePath(ctx, path));
    return resolved ? ok(`${resolved}\n`) : failed();
  }
  try {
    return ok(`${await ctx.vfs.readlink(resolvePath(ctx, path))}\n`);
  } catch {
    return failed();
  }
}

async function resolveCanonical(ctx: ShellCommandContext, path: string): Promise<string | undefined> {
  let pending = normalizePath(path, "/").split("/").filter(Boolean);
  let current = "/";
  let depth = 0;

  while (pending.length) {
    const part = pending.shift()!;
    const candidate = normalizePath(part, current);
    const stat = await ctx.vfs.stat(candidate).catch(() => undefined);
    if (!stat) return undefined;
    if (stat.kind === "symlink") {
      if (++depth > 40) return undefined;
      const target = await ctx.vfs.readlink(candidate).catch(() => undefined);
      if (!target) return undefined;
      const resolvedTarget = normalizePath(target, dirname(candidate));
      pending = [...resolvedTarget.split("/").filter(Boolean), ...pending];
      current = "/";
      continue;
    }
    current = candidate;
  }

  return current;
}
