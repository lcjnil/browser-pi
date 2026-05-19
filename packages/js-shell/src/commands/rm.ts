import { relativePath } from "../path";
import type { ShellCommandContext, ShellResult } from "../types";
import { optionless, resolvePath } from "./helpers";

export async function rm(ctx: ShellCommandContext): Promise<ShellResult> {
  const paths = optionless(ctx.args);
  const recursive = ctx.args.some((arg) => arg.startsWith("-") && /[rR]/.test(arg));
  const force = ctx.args.some((arg) => arg.startsWith("-") && arg.includes("f"));
  if (!paths.length) return force ? ok() : failed("rm: missing operand");

  let exitCode = 0;
  let stderr = "";
  for (const path of paths) {
    const resolved = resolvePath(ctx, path);
    const stat = await ctx.vfs.stat(resolved).catch(() => undefined);
    if (!stat) {
      if (!force) {
        exitCode = 1;
        stderr += `rm: can't remove '${display(ctx, resolved)}': No such file or directory\n`;
      }
      continue;
    }
    if (stat.kind === "directory" && !recursive) {
      exitCode = 1;
      stderr += `rm: can't remove '${display(ctx, resolved)}': Is a directory\n`;
      continue;
    }
    try {
      await ctx.vfs.remove(resolved, { recursive, force });
    } catch (error) {
      exitCode = 1;
      stderr += `rm: can't remove '${display(ctx, resolved)}': ${error instanceof Error ? error.message : "Operation failed"}\n`;
    }
  }

  return { exitCode, stdout: "", stderr };
}

function display(ctx: ShellCommandContext, path: string): string {
  return relativePath(ctx.cwd, path);
}

function ok(): ShellResult {
  return { exitCode: 0, stdout: "", stderr: "" };
}

function failed(stderr: string): ShellResult {
  return { exitCode: 1, stdout: "", stderr: `${stderr}\n` };
}
