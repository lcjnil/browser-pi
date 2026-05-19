import type { ShellCommandContext, ShellResult } from "../types";
import { ok } from "./helpers";

export function dirnameCommand(ctx: ShellCommandContext): ShellResult {
  return ok(`${busyboxDirname(ctx.args[0] ?? "")}\n`);
}

function busyboxDirname(path: string): string {
  if (!path) return ".";
  let value = path.replace(/\/+$/g, "");
  if (!value) return "/";
  const index = value.lastIndexOf("/");
  if (index < 0) return ".";
  value = value.slice(0, index).replace(/\/+$/g, "");
  return value || "/";
}
