import { basename, dirname, normalizePath, relativePath } from "../path";
import type { ShellCommandContext, ShellResult, VFSStat } from "../types";
import { resolvePath } from "./helpers";

interface CpOptions {
  recursive: boolean;
  preserveSymlinks: boolean;
  followAllSymlinks: boolean;
  followCommandLineSymlinks: boolean;
  parents: boolean;
  sources: string[];
}

export async function cp(ctx: ShellCommandContext): Promise<ShellResult> {
  const options = parseOptions(ctx.args);
  if (options.sources.length < 2) return failed("cp: missing file operand");

  const targetArg = options.sources[options.sources.length - 1];
  const sourceArgs = options.sources.slice(0, -1);
  const targetPath = resolvePath(ctx, targetArg);
  const targetStat = await statOrUndefined(ctx, targetPath);
  const needsDirectory = sourceArgs.length > 1 || options.parents;

  if (needsDirectory && targetStat?.kind !== "directory") {
    return failed(`cp: target '${targetArg}' is not a directory`);
  }

  let exitCode = 0;
  let stderr = "";
  for (const sourceArg of sourceArgs) {
    const sourcePath = resolvePath(ctx, sourceArg);
    const destination = destinationPath(ctx, sourceArg, sourcePath, targetPath, targetStat, sourceArgs.length > 1, options.parents);
    const result = await copyPath(ctx, sourcePath, destination, options, true);
    if (result.exitCode !== 0) exitCode = result.exitCode;
    stderr += result.stderr;
  }

  return { exitCode, stdout: "", stderr };
}

function parseOptions(args: string[]): CpOptions {
  const options: CpOptions = {
    recursive: false,
    preserveSymlinks: false,
    followAllSymlinks: false,
    followCommandLineSymlinks: false,
    parents: false,
    sources: [],
  };

  for (const arg of args) {
    if (arg === "--parents") {
      options.parents = true;
      continue;
    }
    if (arg === "--") {
      continue;
    }
    if (arg.startsWith("-") && arg !== "-") {
      for (const flag of arg.slice(1)) {
        if (flag === "R" || flag === "r") options.recursive = true;
        else if (flag === "a") {
          options.recursive = true;
          options.preserveSymlinks = true;
        } else if (flag === "d" || flag === "P") {
          options.preserveSymlinks = true;
          options.followAllSymlinks = false;
        } else if (flag === "L") {
          options.followAllSymlinks = true;
          options.preserveSymlinks = false;
        } else if (flag === "H") {
          options.followCommandLineSymlinks = true;
        }
      }
      continue;
    }
    options.sources.push(arg);
  }

  return options;
}

function destinationPath(
  ctx: ShellCommandContext,
  sourceArg: string,
  sourcePath: string,
  targetPath: string,
  targetStat: VFSStat | undefined,
  multipleSources: boolean,
  parents: boolean,
): string {
  if (parents) {
    const relative = sourceArg.startsWith("/") ? sourceArg.slice(1) : relativePath(ctx.cwd, sourcePath);
    return normalizePath(relative, targetPath);
  }
  if (multipleSources || targetStat?.kind === "directory") return normalizePath(basename(sourcePath), targetPath);
  return targetPath;
}

async function copyPath(
  ctx: ShellCommandContext,
  sourcePath: string,
  destination: string,
  options: CpOptions,
  commandLineSource: boolean,
): Promise<ShellResult> {
  const sourceStat = await statOrUndefined(ctx, sourcePath);
  if (!sourceStat) return failed(`cp: can't stat '${display(ctx, sourcePath)}': No such file or directory`);

  if (sourceStat.kind === "symlink") {
    if (shouldPreserveSymlink(options, commandLineSource)) {
      await ctx.vfs.symlink(await ctx.vfs.readlink(sourcePath), destination);
      return ok();
    }
    const target = normalizePath(await ctx.vfs.readlink(sourcePath), dirname(sourcePath));
    return copyResolvedPath(ctx, target, destination, options, commandLineSource, display(ctx, sourcePath));
  }

  return copyResolvedPath(ctx, sourcePath, destination, options, commandLineSource, display(ctx, sourcePath));
}

async function copyResolvedPath(
  ctx: ShellCommandContext,
  sourcePath: string,
  destination: string,
  options: CpOptions,
  commandLineSource: boolean,
  displayName: string,
): Promise<ShellResult> {
  const stat = await statOrUndefined(ctx, sourcePath);
  if (!stat) return failed(`cp: can't stat '${displayName}': No such file or directory`);

  if (stat.kind === "directory") {
    if (!options.recursive) return failed(`cp: omitting directory '${displayName}'`);
    const destinationStat = await statOrUndefined(ctx, destination);
    const rootDestination = destinationStat?.kind === "directory" && commandLineSource
      ? normalizePath(basename(sourcePath), destination)
      : destination;
    await ctx.vfs.mkdir(rootDestination, { recursive: true });
    let exitCode = 0;
    let stderr = "";
    for (const entry of await ctx.vfs.listDir(sourcePath)) {
      const childResult = await copyPath(
        ctx,
        entry.path,
        normalizePath(entry.name, rootDestination),
        options,
        false,
      );
      if (childResult.exitCode !== 0) exitCode = childResult.exitCode;
      stderr += childResult.stderr;
    }
    return { exitCode, stdout: "", stderr };
  }

  if (stat.kind === "symlink") return copyPath(ctx, sourcePath, destination, options, commandLineSource);
  await ctx.vfs.writeFile(destination, await ctx.vfs.readFile(sourcePath));
  return ok();
}

function shouldPreserveSymlink(options: CpOptions, commandLineSource: boolean): boolean {
  if (options.followAllSymlinks) return false;
  if (options.recursive && options.followCommandLineSymlinks && commandLineSource) return false;
  if (options.recursive) return true;
  return options.preserveSymlinks;
}

async function statOrUndefined(ctx: ShellCommandContext, path: string): Promise<VFSStat | undefined> {
  return ctx.vfs.stat(path).catch(() => undefined);
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
