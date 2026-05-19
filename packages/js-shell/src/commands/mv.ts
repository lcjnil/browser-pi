import { basename, normalizePath, relativePath } from "../path";
import type { ShellCommandContext, ShellResult, VFSStat } from "../types";
import { resolvePath } from "./helpers";

interface MvOptions {
  sources: string[];
  target?: string;
}

export async function mv(ctx: ShellCommandContext): Promise<ShellResult> {
  const options = parseOptions(ctx.args);
  const targetArg = options.target ?? options.sources[options.sources.length - 1];
  const sourceArgs = options.target ? options.sources : options.sources.slice(0, -1);

  if (!targetArg || sourceArgs.length === 0) return failed("mv: missing file operand");

  const targetPath = resolvePath(ctx, targetArg);
  const targetStat = await statOrUndefined(ctx, targetPath);
  if ((sourceArgs.length > 1 || options.target) && targetStat?.kind !== "directory") {
    return failed(`mv: target '${targetArg}' is not a directory`);
  }

  let exitCode = 0;
  let stderr = "";
  for (const sourceArg of sourceArgs) {
    const sourcePath = resolvePath(ctx, sourceArg);
    const destination = targetStat?.kind === "directory" ? normalizePath(basename(sourcePath), targetPath) : targetPath;

    if (isSubpath(destination, sourcePath)) {
      exitCode = 1;
      stderr += `mv: can't move '${display(ctx, sourcePath)}' to a subdirectory of itself\n`;
      continue;
    }

    const result = await movePath(ctx, sourcePath, destination);
    if (result.exitCode !== 0) exitCode = result.exitCode;
    stderr += result.stderr;
  }

  return { exitCode, stdout: "", stderr };
}

function parseOptions(args: string[]): MvOptions {
  const options: MvOptions = { sources: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "-t") {
      options.target = args[++index];
      continue;
    }
    if (arg.startsWith("-t") && arg.length > 2) {
      options.target = arg.slice(2);
      continue;
    }
    if (arg === "--") continue;
    if (arg.startsWith("-") && arg !== "-") continue;
    options.sources.push(arg);
  }
  return options;
}

async function movePath(ctx: ShellCommandContext, sourcePath: string, destination: string): Promise<ShellResult> {
  const stat = await statOrUndefined(ctx, sourcePath);
  if (!stat) return failed(`mv: can't stat '${display(ctx, sourcePath)}': No such file or directory`);

  if (await ctx.vfs.exists(destination)) {
    await ctx.vfs.remove(destination, { force: true, recursive: true });
  }

  if (stat.kind === "symlink") {
    await ctx.vfs.symlink(await ctx.vfs.readlink(sourcePath), destination);
    await ctx.vfs.remove(sourcePath, { force: true });
    return ok();
  }

  if (stat.kind === "directory") {
    await ctx.vfs.mkdir(destination, { recursive: true });
    for (const entry of await ctx.vfs.listDir(sourcePath)) {
      const result = await movePath(ctx, entry.path, normalizePath(entry.name, destination));
      if (result.exitCode !== 0) return result;
    }
    await ctx.vfs.remove(sourcePath, { force: true, recursive: true });
    return ok();
  }

  await ctx.vfs.writeFile(destination, await ctx.vfs.readFile(sourcePath));
  await ctx.vfs.remove(sourcePath, { force: true });
  return ok();
}

async function statOrUndefined(ctx: ShellCommandContext, path: string): Promise<VFSStat | undefined> {
  return ctx.vfs.stat(path).catch(() => undefined);
}

function isSubpath(path: string, parent: string): boolean {
  return path !== parent && path.startsWith(`${parent}/`);
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
