import type { ShellCommandContext, ShellResult } from "../types";
import { ok } from "./helpers";

export function tr(ctx: ShellCommandContext): ShellResult {
  const deleteMode = ctx.args.some((arg) => arg.includes("d"));
  const complement = ctx.args.some((arg) => arg.includes("c"));
  const sets = ctx.args.filter((arg) => !arg.startsWith("-"));
  const from = expandSet(sets[0] ?? "");
  const to = expandSet(sets[1] ?? "");
  const fromSet = new Set(from);
  if (deleteMode) {
    return ok([...ctx.stdin].filter((char) => complement ? fromSet.has(char) : !fromSet.has(char)).join(""));
  }
  const map = new Map<string, string>();
  from.forEach((char, index) => map.set(char, to[index] ?? to[to.length - 1] ?? ""));
  return ok([...ctx.stdin].map((char) => map.get(char) ?? char).join(""));
}

function expandSet(value: string): string[] {
  const normalized = value
    .replace(/\[:alnum:\]/g, "A-ZA-Zxxxxxxxxxx")
    .replace(/\[:alpha:\]/g, "A-ZA-Z")
    .replace(/\[:digit:\]/g, "0123456789")
    .replace(/\[:lower:\]/g, "abcdefghijklmnopqrstuvwxyz")
    .replace(/\[:upper:\]/g, "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    .replace(/\[:xdigit:\]/g, "0123456789ABCDEFabcdef")
    .replace(/\[:space:\]/g, " \t\n\r\v\f")
    .replace(/\[:blank:\]/g, " \t");
  const chars: string[] = [];
  for (let i = 0; i < normalized.length; i++) {
    if (i + 2 < normalized.length && normalized[i + 1] === "-") {
      const start = normalized.charCodeAt(i);
      const end = normalized.charCodeAt(i + 2);
      const step = start <= end ? 1 : -1;
      for (let code = start; step > 0 ? code <= end : code >= end; code += step) chars.push(String.fromCharCode(code));
      i += 2;
    } else {
      chars.push(normalized[i]);
    }
  }
  return chars;
}
