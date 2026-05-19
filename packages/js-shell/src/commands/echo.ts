import type { ShellCommandContext, ShellResult } from "../types";
import { ok } from "./helpers";

export function echo(ctx: ShellCommandContext): ShellResult {
  let newline = true;
  let escapes = false;
  let index = 0;
  while (index < ctx.args.length && /^-[neE]+$/.test(ctx.args[index])) {
    if (ctx.args[index].includes("n")) newline = false;
    if (ctx.args[index].includes("e")) escapes = true;
    if (ctx.args[index].includes("E")) escapes = false;
    index++;
  }
  let text = ctx.args.slice(index).join(" ");
  if (escapes) text = unescapeEcho(text);
  return ok(`${text}${newline ? "\n" : ""}`);
}

function unescapeEcho(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "\\") {
      out += value[i];
      continue;
    }
    const next = value[++i];
    if (next === "n") out += "\n";
    else if (next === "t") out += "\t";
    else if (next === "r") out += "\r";
    else if (next === "b") out += "\b";
    else if (next === "a") out += "\x07";
    else if (next === "f") out += "\f";
    else if (next === "v") out += "\v";
    else if (next === "\\") out += "\\";
    else if (next === "0") {
      let digits = "";
      while (i + 1 < value.length && digits.length < 3 && /[0-7]/.test(value[i + 1])) digits += value[++i];
      out += String.fromCharCode(parseInt(digits || "0", 8));
    } else if (/[0-7]/.test(next ?? "")) {
      let digits = next;
      while (i + 1 < value.length && digits.length < 3 && /[0-7]/.test(value[i + 1])) digits += value[++i];
      out += String.fromCharCode(parseInt(digits, 8));
    } else {
      out += next ?? "";
    }
  }
  return out;
}
