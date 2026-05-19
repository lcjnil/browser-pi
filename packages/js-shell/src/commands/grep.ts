import type { ShellCommandContext, ShellResult } from "../types";
import { displayPath, resolvePath, walk } from "./helpers";

export async function grep(ctx: ShellCommandContext): Promise<ShellResult> {
  const parsed = await parseGrepArgs(ctx);
  const regexes = parsed.patterns.flatMap((pattern) => parsed.fixed ? pattern.split("\n").filter(Boolean) : [pattern]).map((pattern) => {
    const source = parsed.fixed ? escapeRegExp(pattern) : translatePosixClasses(parsed.extended ? pattern : translateBasicRegex(pattern));
    const whole = parsed.wholeLine ? `^(?:${source})$` : parsed.word ? `(^|[^A-Za-z0-9_])(?:${source})(?=$|[^A-Za-z0-9_])` : source;
    return new RegExp(whole, parsed.ignoreCase ? "gi" : "g");
  });
  const lines: string[] = [];
  const nonMatchingFiles: string[] = [];
  let hadError = false;
  let hadMatch = false;

  if (!parsed.paths.length) {
    const matched = collectGrep(lines, ctx.stdin, regexes, "", parsed);
    hadMatch ||= matched;
    return finishGrep({ lines, nonMatchingFiles, hadError, hadMatch, quiet: parsed.quiet });
  }

  const showPrefix = parsed.paths.length > 1;
  for (const path of parsed.paths) {
    if (path === "-") {
      const matched = collectGrep(lines, ctx.stdin, regexes, showPrefix ? "(standard input)" : "", parsed);
      hadMatch ||= matched;
      if (parsed.listNonMatching && !matched) nonMatchingFiles.push("(standard input)");
      continue;
    }
    try {
      const absolute = resolvePath(ctx, path);
      const stat = await ctx.vfs.stat(absolute);
      const files = stat.kind === "directory" && parsed.recursive
        ? (await walk(ctx.vfs, absolute)).filter((entry) => entry.kind === "file").map((entry) => entry.path)
        : [absolute];
      const multiFile = showPrefix || files.length > 1 || stat.kind === "directory";
      let fileMatched = false;
      for (const file of files) {
        const prefix = multiFile ? grepDisplayPath(ctx.cwd, file) : "";
        const matched = collectGrep(lines, await ctx.vfs.readText(file), regexes, prefix, parsed);
        fileMatched ||= matched;
        hadMatch ||= matched;
      }
      if (parsed.listNonMatching && !fileMatched) nonMatchingFiles.push(path);
    } catch (error) {
      hadError = true;
      if (!parsed.silent) lines.push("");
    }
  }
  return finishGrep({ lines, nonMatchingFiles, hadError, hadMatch, quiet: parsed.quiet });
}

interface GrepOptions {
  recursive: boolean;
  numbered: boolean;
  ignoreCase: boolean;
  invert: boolean;
  quiet: boolean;
  silent: boolean;
  fixed: boolean;
  extended: boolean;
  onlyMatching: boolean;
  wholeLine: boolean;
  word: boolean;
  listNonMatching: boolean;
  patterns: string[];
  paths: string[];
}

async function parseGrepArgs(ctx: ShellCommandContext): Promise<GrepOptions> {
  const options: GrepOptions = {
    recursive: false,
    numbered: false,
    ignoreCase: false,
    invert: false,
    quiet: false,
    silent: false,
    fixed: false,
    extended: false,
    onlyMatching: false,
    wholeLine: false,
    word: false,
    listNonMatching: false,
    patterns: [],
    paths: [],
  };
  const operands: string[] = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const arg = ctx.args[i];
    if (arg === "-e") options.patterns.push(ctx.args[++i] ?? "");
    else if (arg.startsWith("-e") && arg.length > 2) options.patterns.push(arg.slice(2));
    else if (arg === "-f") {
      const file = ctx.args[++i];
      const text = file === "-" ? ctx.stdin : await ctx.vfs.readText(resolvePath(ctx, file));
      options.patterns.push(...text.split("\n").filter(Boolean));
    } else if (arg.startsWith("-") && arg !== "-") {
      for (const flag of arg.slice(1)) {
        if (flag === "R" || flag === "r") options.recursive = true;
        else if (flag === "n") options.numbered = true;
        else if (flag === "i") options.ignoreCase = true;
        else if (flag === "v") options.invert = true;
        else if (flag === "q") options.quiet = true;
        else if (flag === "s") options.silent = true;
        else if (flag === "F") options.fixed = true;
        else if (flag === "E") options.extended = true;
        else if (flag === "o") options.onlyMatching = true;
        else if (flag === "x") options.wholeLine = true;
        else if (flag === "w") options.word = true;
        else if (flag === "L") options.listNonMatching = true;
      }
    } else {
      operands.push(arg);
    }
  }
  if (!options.patterns.length) options.patterns.push(operands.shift() ?? "");
  options.paths = operands;
  return options;
}

function collectGrep(lines: string[], text: string, regexes: RegExp[], prefix: string, options: GrepOptions): boolean {
  let any = false;
  text.split("\n").forEach((line, index) => {
    if (!line && index === text.split("\n").length - 1) return;
    const matched = regexes.some((regex) => {
      regex.lastIndex = 0;
      return regex.test(line);
    });
    if (matched) any = true;
    if (matched === !options.invert && !options.quiet) {
      if (options.listNonMatching) return;
      if (options.onlyMatching && !options.invert) {
        for (const regex of regexes) {
          regex.lastIndex = 0;
          for (const match of line.matchAll(regex)) {
            if (match[0] === "") break;
            lines.push(formatGrepLine(prefix, options.numbered ? index + 1 : undefined, match[0].replace(/^[^A-Za-z0-9_]/, "")));
          }
        }
      } else {
        lines.push(formatGrepLine(prefix, options.numbered ? index + 1 : undefined, line));
      }
    }
  });
  return any;
}

function finishGrep(options: {
  lines: string[];
  nonMatchingFiles: string[];
  hadError: boolean;
  hadMatch: boolean;
  quiet: boolean;
}): ShellResult {
  if (options.quiet && options.hadMatch) return { exitCode: 0, stdout: "", stderr: "" };
  const outputLines = [...options.lines.filter((line) => line !== ""), ...options.nonMatchingFiles];
  const stdout = outputLines.join("\n") + (outputLines.length ? "\n" : "");
  const exitCode = options.hadError ? 2 : (options.hadMatch || options.nonMatchingFiles.length ? 0 : 1);
  return { exitCode, stdout, stderr: "" };
}

function formatGrepLine(prefix: string, lineNo: number | undefined, line: string): string {
  return [prefix, lineNo === undefined ? undefined : String(lineNo), line].filter((part) => part !== undefined && part !== "").join(":");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translatePosixClasses(value: string): string {
  return value
    .replace(/\[:xdigit:\]/g, "0-9A-Fa-f")
    .replace(/\[:digit:\]/g, "0-9")
    .replace(/\[:alnum:\]/g, "A-Za-z0-9")
    .replace(/\[:alpha:\]/g, "A-Za-z")
    .replace(/\[:lower:\]/g, "a-z")
    .replace(/\[:upper:\]/g, "A-Z")
    .replace(/\[:space:\]/g, "\\s");
}

function translateBasicRegex(value: string): string {
  let output = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\" && i + 1 < value.length) {
      const next = value[++i];
      if ("+?|(){}".includes(next)) output += next;
      else output += `\\${next}`;
      continue;
    }
    if ("+?|(){}".includes(char)) output += `\\${char}`;
    else output += char;
  }
  return output;
}

function grepDisplayPath(cwd: string, path: string): string {
  const displayed = displayPath(cwd, path);
  return displayed.startsWith("./") ? displayed.slice(2) : displayed;
}
