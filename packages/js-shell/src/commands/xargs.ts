import type { ShellCommandContext, ShellResult } from "../types";

export async function xargs(ctx: ShellCommandContext): Promise<ShellResult> {
  const eof = optionValue(ctx.args, "-E") ?? (ctx.args.includes("-e") ? undefined : undefined);
  const nullTerminated = ctx.args.includes("-0");
  const trace = ctx.args.some((arg) => arg.includes("t"));
  const maxArgs = Number(optionValue(ctx.args, "-n") ?? 0);
  const sizeLimit = Number(optionValue(ctx.args, "-s") ?? 0);
  const commandArgs = commandOperands(ctx.args);
  const base = commandArgs.length ? commandArgs : ["echo"];
  let items = nullTerminated ? ctx.stdin.split("\0").filter(Boolean) : ctx.stdin.split(/\s+/).filter(Boolean);
  if (eof !== undefined && eof !== "") {
    const index = items.indexOf(eof);
    if (index >= 0) items = items.slice(0, index);
  }
  const chunks = chunkItems(base, items, maxArgs, sizeLimit);
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  for (const chunk of chunks) {
    const argv = [...base, ...chunk];
    if (trace) stderr += `${argv.join(" ")}\n`;
    const result = await ctx.shell.exec(argv.map(shellQuote).join(" "), { cwd: ctx.cwd, env: ctx.env });
    stdout += result.stdout;
    stderr += result.stderr;
    exitCode = result.exitCode;
    if (exitCode !== 0) break;
  }
  return { exitCode, stdout, stderr };
}

function optionValue(args: string[], flag: string): string | undefined {
  const compact = args.find((arg) => arg.startsWith(flag) && arg.length > flag.length);
  if (compact) return compact.slice(flag.length);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function commandOperands(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["-E", "-e", "-n", "-s", "-I"].includes(arg)) {
      i++;
      continue;
    }
    if (/^-[EnsI]/.test(arg) || arg === "-0" || arg === "-t") continue;
    out.push(arg);
  }
  return out;
}

function chunkItems(base: string[], items: string[], maxArgs: number, sizeLimit: number): string[][] {
  if (maxArgs > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < items.length; i += maxArgs) chunks.push(items.slice(i, i + maxArgs));
    return chunks;
  }
  if (sizeLimit > 0) {
    const chunks: string[][] = [];
    let current: string[] = [];
    for (const item of items) {
      const next = [...base, ...current, item].join(" ");
      if (current.length && next.length > sizeLimit) {
        chunks.push(current);
        current = [item];
      } else current.push(item);
    }
    if (current.length) chunks.push(current);
    return chunks;
  }
  return [items];
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}
