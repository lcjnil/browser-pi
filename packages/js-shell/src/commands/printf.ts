import type { ShellCommandContext, ShellResult } from "../types";

export function printf(ctx: ShellCommandContext): ShellResult {
  const format = ctx.args[0] ?? "";
  const args = ctx.args.slice(1);
  let index = 0;
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    if (!format) return { exitCode: 0, stdout: "", stderr: "" };
    do {
      const result = renderFormat(format, args, index);
      stdout += result.stdout;
      stderr += result.stderr;
      exitCode = Math.max(exitCode, result.exitCode);
      index = result.index;
      if (result.stop) break;
    } while (index < args.length && hasConversion(format));
  } catch (error) {
    return {
      exitCode: 1,
      stdout,
      stderr: stderr + (error instanceof Error ? `printf: ${error.message}\n` : `printf: ${String(error)}\n`),
    };
  }

  return { exitCode, stdout, stderr };
}

function renderFormat(format: string, args: string[], start: number): {
  stdout: string;
  stderr: string;
  exitCode: number;
  index: number;
  stop: boolean;
} {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let index = start;

  for (let i = 0; i < format.length; i++) {
    const char = format[i];
    if (char === "\\") {
      const escaped = parseEscape(format, i);
      stdout += escaped.value;
      i = escaped.index;
      if (escaped.stop) return { stdout, stderr, exitCode, index, stop: true };
      continue;
    }
    if (char !== "%") {
      stdout += char;
      continue;
    }

    if (i === format.length - 1) throw new Error("%: invalid format");
    if (format[i + 1] === "%") {
      stdout += "%";
      i++;
      continue;
    }

    const spec = parseSpec(format, i);
    i = spec.end;
    let width = spec.width;
    let precision = spec.precision;
    if (width === "*") width = Number(args[index++] ?? 0);
    if (precision === "*") precision = Number(args[index++] ?? 0);
    const arg = args[index++] ?? "";

    if (spec.type === "s") stdout += padString(arg, width);
    else if (spec.type === "b") {
      const escaped = unescapePrintf(arg);
      stdout += escaped.value;
      if (escaped.stop) return { stdout, stderr, exitCode, index, stop: true };
    } else if (spec.type === "d" || spec.type === "i") {
      const parsed = parseInteger(arg);
      if (!parsed.valid) {
        stderr += `printf: invalid number '${arg}'\n`;
        exitCode = 1;
      }
      stdout += padString(String(parsed.value), width, spec.zeroPad);
    } else if (spec.type === "x") {
      const parsed = parseInteger(arg);
      if (!parsed.valid) {
        stderr += `printf: invalid number '${arg}'\n`;
        exitCode = 1;
      }
      stdout += padString(Math.trunc(parsed.value).toString(16), width, spec.zeroPad);
    } else if (spec.type === "f") {
      const parsed = Number(String(arg).trim());
      const value = Number.isFinite(parsed) ? parsed : 0;
      if (!Number.isFinite(parsed)) {
        stderr += `printf: invalid number '${arg}'\n`;
        exitCode = 1;
      }
      const digits = typeof precision === "number" && precision >= 0 ? precision : 6;
      stdout += padString(value.toFixed(digits), width, spec.zeroPad);
    } else {
      throw new Error(`%${spec.type}: invalid format`);
    }
  }

  return { stdout, stderr, exitCode, index, stop: false };
}

function hasConversion(format: string): boolean {
  return /%(?:[-+ #0]*|\*|\d|\.)*[^%]/.test(format);
}

function parseSpec(format: string, start: number): {
  type: string;
  end: number;
  width?: number | "*";
  precision?: number | "*";
  zeroPad: boolean;
} {
  let i = start + 1;
  let left = false;
  let zeroPad = false;
  while ("-+ #0".includes(format[i] ?? "")) {
    if (format[i] === "-") left = true;
    if (format[i] === "0") zeroPad = true;
    i++;
  }
  let width: number | "*" | undefined;
  if (format[i] === "*") {
    width = "*";
    i++;
  } else {
    const match = format.slice(i).match(/^\d+/);
    if (match) {
      width = Number(match[0]);
      i += match[0].length;
    }
  }
  let precision: number | "*" | undefined;
  if (format[i] === ".") {
    i++;
    if (format[i] === "*") {
      precision = "*";
      i++;
    } else {
      const match = format.slice(i).match(/^\d+/);
      precision = match ? Number(match[0]) : 0;
      i += match?.[0].length ?? 0;
    }
  }
  while ("zLl".includes(format[i] ?? "")) i++;
  const type = format[i];
  if (!type) throw new Error(`${format.slice(start)}: invalid format`);
  if (left && typeof width === "number") width = -width;
  return { type, end: i, width, precision, zeroPad };
}

function padString(value: string, width?: number | "*", zeroPad = false): string {
  if (typeof width !== "number" || width === 0) return value;
  const absolute = Math.abs(width);
  if (value.length >= absolute) return value;
  const pad = (zeroPad && width > 0 ? "0" : " ").repeat(absolute - value.length);
  return width < 0 ? value + pad : pad + value;
}

function parseInteger(value: string): { value: number; valid: boolean } {
  const trimmed = value.trimStart();
  if (/^["']./.test(trimmed)) return { value: trimmed.charCodeAt(1), valid: true };
  const match = trimmed.match(/^[+-]?\d+/);
  if (!match || match[0] !== trimmed.trim()) return { value: match ? Number(match[0]) : 0, valid: false };
  return { value: Number(match[0]), valid: true };
}

function unescapePrintf(value: string): { value: string; stop: boolean } {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "\\") {
      out += value[i];
      continue;
    }
    const escaped = parseEscape(value, i);
    out += escaped.value;
    i = escaped.index;
    if (escaped.stop) return { value: out, stop: true };
  }
  return { value: out, stop: false };
}

function parseEscape(value: string, start: number): { value: string; index: number; stop?: boolean } {
  const next = value[start + 1];
  if (next === "c") return { value: "", index: start + 1, stop: true };
  if (next === "n") return { value: "\n", index: start + 1 };
  if (next === "t") return { value: "\t", index: start + 1 };
  if (next === "r") return { value: "\r", index: start + 1 };
  if (next === "b") return { value: "\b", index: start + 1 };
  if (next === "a") return { value: "\x07", index: start + 1 };
  if (next === "f") return { value: "\f", index: start + 1 };
  if (next === "v") return { value: "\v", index: start + 1 };
  if (next === "\\") return { value: "\\", index: start + 1 };
  if (/[0-7]/.test(next ?? "")) {
    let digits = next;
    let i = start + 1;
    while (i + 1 < value.length && digits.length < 3 && /[0-7]/.test(value[i + 1])) digits += value[++i];
    return { value: String.fromCharCode(parseInt(digits, 8)), index: i };
  }
  return { value: next ?? "", index: start + 1 };
}
