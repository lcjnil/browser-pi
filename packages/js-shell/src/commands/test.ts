import type { ShellCommandContext, ShellResult } from "../types";
import { failed, ok, resolvePath } from "./helpers";

export async function testCommand(ctx: ShellCommandContext): Promise<ShellResult> {
  const args = ctx.args.filter((arg) => arg !== "]");
  return await evalOr(ctx, args) ? ok("") : failed();
}

async function evalOr(ctx: ShellCommandContext, args: string[]): Promise<boolean> {
  const index = args.lastIndexOf("-o");
  if (index >= 0) return await evalOr(ctx, args.slice(0, index)) || await evalAnd(ctx, args.slice(index + 1));
  return evalAnd(ctx, args);
}

async function evalAnd(ctx: ShellCommandContext, args: string[]): Promise<boolean> {
  const index = args.lastIndexOf("-a");
  if (index >= 0) return await evalAnd(ctx, args.slice(0, index)) && await evalPrimary(ctx, args.slice(index + 1));
  return evalPrimary(ctx, args);
}

async function evalPrimary(ctx: ShellCommandContext, args: string[]): Promise<boolean> {
  if (args.length === 0) return false;
  if (args[0] === "!") return !await evalPrimary(ctx, args.slice(1));
  if (args.length === 1) return args[0] !== "";
  if (args[0] === "-n") return (args[1] ?? "") !== "";
  if (args[0] === "-z") return (args[1] ?? "") === "";
  if (args[0] === "-f" && args.length === 2) {
    try {
      return (await ctx.vfs.stat(resolvePath(ctx, args[1]))).kind === "file";
    } catch {
      return false;
    }
  }
  if (args[0] === "-d" && args.length === 2) {
    try {
      return (await ctx.vfs.stat(resolvePath(ctx, args[1]))).kind === "directory";
    } catch {
      return false;
    }
  }
  if (args[0] === "-L" && args.length === 2) {
    try {
      return (await ctx.vfs.stat(resolvePath(ctx, args[1]))).kind === "symlink";
    } catch {
      return false;
    }
  }
  if (args.length === 3 && (args[1] === "=" || args[1] === "==")) return args[0] === args[2];
  if (args.length === 3 && args[1] === "!=") return args[0] !== args[2];
  if (args.length === 3 && numericOps.has(args[1])) return compareNumbers(Number(args[0]), args[1], Number(args[2]));
  return false;
}

const numericOps = new Set(["-eq", "-ne", "-lt", "-le", "-gt", "-ge"]);

function compareNumbers(left: number, op: string, right: number): boolean {
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  if (op === "-eq") return left === right;
  if (op === "-ne") return left !== right;
  if (op === "-lt") return left < right;
  if (op === "-le") return left <= right;
  if (op === "-gt") return left > right;
  return left >= right;
}
