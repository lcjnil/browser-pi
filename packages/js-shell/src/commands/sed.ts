import type { ShellCommandContext, ShellResult } from "../types";
import { ok, resolvePath } from "./helpers";

interface SedOptions {
  noPrint: boolean;
  inPlace: boolean;
  scripts: string[];
  files: string[];
}

interface Line {
  text: string;
  newline: boolean;
}

interface SedCommand {
  address?: Address;
  kind: "empty" | "substitute" | "print" | "delete" | "append" | "insert";
  substitution?: Substitution;
  text?: string;
}

type Address =
  | { kind: "line"; line: number }
  | { kind: "last" }
  | { kind: "regex"; regex: RegExp };

interface Substitution {
  regex: RegExp;
  replacement: string;
  print: boolean;
  delimiter: string;
  occurrence?: number;
}

export async function sed(ctx: ShellCommandContext): Promise<ShellResult> {
  const options = parseOptions(ctx.args);
  const commands = options.scripts.flatMap(parseScript);
  if (!commands.length) commands.push({ kind: "empty" });

  if (options.inPlace) {
    for (const file of options.files.filter((file) => file !== "-")) {
      const result = runSed(await ctx.vfs.readText(resolvePath(ctx, file)), commands, options.noPrint);
      await ctx.vfs.writeText(resolvePath(ctx, file), result);
    }
    return ok("");
  }

  const inputs = options.files.length ? options.files : ["-"];
  let stdout = "";
  let stdinUsed = false;
  for (const file of inputs) {
    if (file === "-") {
      stdout += stdinUsed ? "" : runSed(ctx.stdin, commands, options.noPrint);
      stdinUsed = true;
    } else {
      stdout += runSed(await ctx.vfs.readText(resolvePath(ctx, file)), commands, options.noPrint);
    }
  }
  return ok(stdout);
}

function parseOptions(args: string[]): SedOptions {
  const options: SedOptions = { noPrint: false, inPlace: false, scripts: [], files: [] };
  let scriptSeen = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!scriptSeen && arg === "-n") {
      options.noPrint = true;
      continue;
    }
    if (!scriptSeen && arg === "-i") {
      options.inPlace = true;
      continue;
    }
    if (!scriptSeen && arg === "-e") {
      options.scripts.push(args[++index] ?? "");
      continue;
    }
    if (!scriptSeen && arg.startsWith("-e")) {
      options.scripts.push(arg.slice(2));
      continue;
    }
    if (!scriptSeen && arg.startsWith("-") && arg.includes("n") && arg.includes("e")) {
      options.noPrint = true;
      const next = args[++index];
      if (next) options.scripts.push(next);
      continue;
    }
    if (!scriptSeen && !options.scripts.length) {
      options.scripts.push(arg);
      scriptSeen = true;
      continue;
    }
    options.files.push(arg);
  }

  return options;
}

function runSed(input: string, commands: SedCommand[], noPrint: boolean): string {
  const lines = splitInput(input);
  let output = "";

  for (let index = 0; index < lines.length; index++) {
    let pattern = lines[index].text;
    let deleted = false;
    let append = "";

    for (const command of commands) {
      if (!matchesAddress(command.address, pattern, index, lines.length)) continue;
      if (command.kind === "empty") continue;
      if (command.kind === "print") {
        output += formatLine(pattern, lines[index].newline);
        continue;
      }
      if (command.kind === "delete") {
        deleted = true;
        break;
      }
      if (command.kind === "append") {
        append += `${command.text ?? ""}\n`;
        continue;
      }
      if (command.kind === "insert") {
        output += `${command.text ?? ""}\n`;
        continue;
      }
      if (command.kind === "substitute" && command.substitution) {
        const result = substitute(pattern, command.substitution);
        pattern = result.text;
        if (result.changed && command.substitution.print) output += formatLine(pattern, lines[index].newline);
      }
    }

    if (!deleted && !noPrint) output += formatLine(pattern, append ? true : lines[index].newline);
    output += append;
  }

  return output;
}

function parseScript(script: string): SedCommand[] {
  return splitCommands(script).map(parseCommand).filter((command): command is SedCommand => !!command);
}

function splitCommands(script: string): string[] {
  const commands: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of script) {
    if ((char === ";" || char === "\n") && !escaped) {
      commands.push(current);
      current = "";
      continue;
    }
    current += char;
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }
  commands.push(current);
  return commands.map((command) => command.trim()).filter((command) => command.length > 0);
}

function parseCommand(source: string): SedCommand | undefined {
  const { address, rest } = parseAddress(source.trim());
  if (!rest) return { kind: "empty", address };
  if (rest === "p") return { kind: "print", address };
  if (rest === "d") return { kind: "delete", address };
  if (rest.startsWith("a")) return { kind: "append", address, text: decodeText(rest.slice(1).replace(/^\\?/, "").trimStart()) };
  if (rest.startsWith("i")) return { kind: "insert", address, text: decodeText(rest.slice(1).replace(/^\\?/, "").trimStart()) };
  if (rest.startsWith("s")) return { kind: "substitute", address, substitution: parseSubstitution(rest) };
  return { kind: "empty", address };
}

function parseAddress(source: string): { address?: Address; rest: string } {
  if (source.startsWith("$")) return { address: { kind: "last" }, rest: source.slice(1).trimStart() };
  const numeric = source.match(/^([0-9]+)(.*)$/);
  if (numeric) return { address: { kind: "line", line: Number(numeric[1]) }, rest: numeric[2].trimStart() };
  if (source.startsWith("/")) {
    const end = findUnescaped(source, "/", 1);
    if (end > 0) {
      return {
        address: { kind: "regex", regex: new RegExp(toJsRegex(source.slice(1, end))) },
        rest: source.slice(end + 1).trimStart(),
      };
    }
  }
  return { rest: source };
}

function parseSubstitution(source: string): Substitution {
  const delimiter = source[1];
  const patternEnd = findUnescaped(source, delimiter, 2, true);
  const replacementEnd = findUnescaped(source, delimiter, patternEnd + 1);
  const pattern = source.slice(2, patternEnd);
  const replacement = source.slice(patternEnd + 1, replacementEnd);
  const flags = source.slice(replacementEnd + 1);
  const occurrence = flags.match(/[1-9][0-9]*/)?.[0];
  const global = flags.includes("g") || !!occurrence;
  return {
    regex: new RegExp(toJsRegex(pattern), global ? "g" : ""),
    replacement: decodeReplacement(replacement),
    print: flags.includes("p"),
    delimiter,
    occurrence: occurrence ? Number(occurrence) : undefined,
  };
}

function substitute(input: string, substitution: Substitution): { text: string; changed: boolean } {
  let changed = false;
  let seen = 0;
  const text = input.replace(substitution.regex, (...args: unknown[]) => {
    const match = String(args[0]);
    const groups = args.slice(1, -2).map(String);
    seen += 1;
    if (substitution.occurrence && seen !== substitution.occurrence) return match;
    changed = true;
    return expandReplacement(substitution.replacement, match, groups, substitution.delimiter);
  });
  return { text, changed };
}

function expandReplacement(replacement: string, match: string, groups: string[], delimiter: string): string {
  const escapedDelimiter = `\0SED_DELIMITER_${delimiter.charCodeAt(0)}\0`;
  const withDelimiterPlaceholder = replacement.replace(new RegExp(`\\\\${escapeRegExp(delimiter)}`, "g"), escapedDelimiter);
  return withDelimiterPlaceholder
    .replace(/(^|[^\\])&/g, (_all, prefix: string) => `${prefix}${match}`)
    .replace(/\\([0-9])/g, (_all, index: string) => groups[Number(index) - 1] ?? "")
    .replace(/\\&/g, "&")
    .replaceAll(escapedDelimiter, delimiter);
}

function matchesAddress(address: Address | undefined, pattern: string, index: number, total: number): boolean {
  if (!address) return true;
  if (address.kind === "line") return index + 1 === address.line;
  if (address.kind === "last") return index + 1 === total;
  return address.regex.test(pattern);
}

function splitInput(input: string): Line[] {
  if (input === "") return [];
  const raw = input.split("\n");
  const lines: Line[] = [];
  for (let index = 0; index < raw.length; index++) {
    if (index === raw.length - 1 && raw[index] === "") continue;
    lines.push({ text: raw[index], newline: index < raw.length - 1 });
  }
  return lines;
}

function formatLine(text: string, newline: boolean): string {
  return `${text}${newline ? "\n" : ""}`;
}

function findUnescaped(source: string, needle: string, start: number, ignoreCharacterClass = false): number {
  let escaped = false;
  let inCharacterClass = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (ignoreCharacterClass && char === "[" && !escaped) inCharacterClass = true;
    if (ignoreCharacterClass && char === "]" && !escaped) inCharacterClass = false;
    if (char === needle && !escaped && !inCharacterClass) return index;
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }
  return source.length;
}

function decodeText(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\(.)/g, "$1");
}

function decodeReplacement(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");
}

function toJsRegex(pattern: string): string {
  return pattern
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\|/g, "|")
    .replace(/\[[:space:]\]/g, "\\s")
    .replace(/\\t/g, "\t");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
