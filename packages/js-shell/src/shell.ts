import { createDefaultCommands } from "./commands";
import { basename, dirname, normalizePath } from "./path";
import { createMemoryVFS } from "./vfs";
import type {
  AsyncVFS,
  CreateJsShellOptions,
  JsShell,
  ShellCommand,
  ShellCommandContext,
  ShellExecOptions,
  ShellResult,
} from "./types";

type Token =
  | { type: "word"; parts: WordPart[] }
  | { type: "op"; value: string };

interface WordPart {
  text: string;
  quote: "none" | "single" | "double";
}

interface CommandNode {
  assignments: Record<string, string>;
  argv: Token[];
  redirs: Redirection[];
}

interface Redirection {
  fd: 0 | 1 | 2;
  op: ">" | ">>" | "<" | "<>" | ">|" | ">&" | "<<" | "<<-" | "&>";
  target: Token;
}

interface PipelineNode {
  commands: CommandNode[];
}

interface SegmentNode {
  connector: ";" | "&&" | "||";
  pipeline: PipelineNode;
}

interface RuntimeState {
  cwd: string;
  env: Record<string, string>;
}

interface Fds {
  stdin: string;
  stdoutPath?: string;
  stdoutAppend?: boolean;
  stderrPath?: string;
  stderrAppend?: boolean;
  mergeStderrToStdout?: boolean;
  mergeStdoutToStderr?: boolean;
}

export function createJsShell(options: CreateJsShellOptions = {}): JsShell {
  return new JsShellImpl(options);
}

class JsShellImpl implements JsShell {
  readonly vfs: AsyncVFS;
  private readonly commands = new Map<string, ShellCommand>();
  private readonly state: RuntimeState;

  constructor(options: CreateJsShellOptions) {
    this.vfs = options.vfs ?? createMemoryVFS({ cwd: options.cwd });
    this.state = {
      cwd: normalizePath(options.cwd ?? this.vfs.cwd ?? "/workspace", "/"),
      env: { PWD: normalizePath(options.cwd ?? this.vfs.cwd ?? "/workspace", "/"), ...options.env },
    };
    for (const [name, command] of Object.entries(createDefaultCommands())) {
      this.commands.set(name, command);
    }
    for (const [name, command] of Object.entries(options.commands ?? {})) {
      this.commands.set(name, command);
    }
  }

  registerCommand(name: string, command: ShellCommand): void {
    this.commands.set(name, command);
  }

  async exec(script: string, options: ShellExecOptions = {}): Promise<ShellResult> {
    const previous = { cwd: this.state.cwd, env: { ...this.state.env } };
    this.state.cwd = normalizePath(options.cwd ?? this.state.cwd, "/");
    this.state.env = { ...this.state.env, ...options.env, PWD: this.state.cwd };

    try {
      if (options.signal?.aborted) return fail("aborted");
      const task = this.executeScript(script, options.stdin ?? "", options.signal);
      const result = options.timeoutMs ? await withTimeout(task, options.timeoutMs) : await task;
      return result;
    } finally {
      if (options.cwd) {
        this.state.cwd = previous.cwd;
        this.state.env = previous.env;
      }
    }
  }

  private async executeScript(
    script: string,
    stdin: string,
    signal?: AbortSignal,
  ): Promise<ShellResult> {
    const expanded = await this.expandControlForms(script, stdin, signal);
    const tokens = tokenize(expanded);
    const segments = parseSegments(tokens);
    let last: ShellResult = { exitCode: 0, stdout: "", stderr: "" };
    let stdout = "";
    let stderr = "";

    for (const segment of segments) {
      if (signal?.aborted) return fail("aborted");
      if (segment.connector === "&&" && last.exitCode !== 0) continue;
      if (segment.connector === "||" && last.exitCode === 0) continue;
      last = await this.executePipeline(segment.pipeline, stdin);
      this.state.env["?"] = String(last.exitCode);
      stdout += last.stdout;
      stderr += last.stderr;
    }
    return { exitCode: last.exitCode, stdout, stderr };
  }

  private async expandControlForms(
    script: string,
    stdin: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const trimmed = script.trim();
    const ifMatch = trimmed.match(/^if\s+([\s\S]+?)\s+then\s+([\s\S]*?)(?:\s+else\s+([\s\S]*?))?\s+fi$/);
    if (ifMatch) {
      const condition = await this.executeScript(ifMatch[1], stdin, signal);
      return condition.exitCode === 0 ? ifMatch[2] : (ifMatch[3] ?? "");
    }

    const forMatch = trimmed.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([\s\S]+?)\s+do\s+([\s\S]*?)\s+done$/);
    if (forMatch) {
      const words = await expandWord(tokenize(forMatch[2]).filter(isWordToken), this.state, this);
      let out = "";
      let err = "";
      let code = 0;
      for (const word of words) {
        this.state.env[forMatch[1]] = word;
        const result = await this.executeScript(forMatch[3], stdin, signal);
        out += result.stdout;
        err += result.stderr;
        code = result.exitCode;
        if (code !== 0) break;
      }
      return `printf ${shellQuote(out)}; printf ${shellQuote(err)} 1>&2; ${code === 0 ? "true" : "false"}`;
    }

    const whileMatch = trimmed.match(/^while\s+([\s\S]+?)\s+do\s+([\s\S]*?)\s+done$/);
    if (whileMatch) {
      let out = "";
      let err = "";
      let code = 0;
      for (let i = 0; i < 10_000; i++) {
        const condition = await this.executeScript(whileMatch[1], stdin, signal);
        if (condition.exitCode !== 0) break;
        const result = await this.executeScript(whileMatch[2], stdin, signal);
        out += result.stdout;
        err += result.stderr;
        code = result.exitCode;
        if (code !== 0) break;
      }
      return `printf ${shellQuote(out)}; printf ${shellQuote(err)} 1>&2; ${code === 0 ? "true" : "false"}`;
    }

    return script;
  }

  private async executePipeline(pipeline: PipelineNode, stdin: string): Promise<ShellResult> {
    let input = stdin;
    let stderr = "";
    let last: ShellResult = ok("");

    for (let index = 0; index < pipeline.commands.length; index++) {
      last = await this.executeCommand(pipeline.commands[index], input);
      stderr += last.stderr;
      input = last.stdout;
      if (last.exitCode !== 0) break;
    }

    return {
      exitCode: last.exitCode,
      stdout: last.stdout,
      stderr,
    };
  }

  private async executeCommand(node: CommandNode, stdin: string): Promise<ShellResult> {
    const localEnv = { ...this.state.env };
    for (const [key, value] of Object.entries(node.assignments)) {
      localEnv[key] = await expandScalar(tokenize(value).find(isWordToken) ?? wordToken(value), this.state, this);
    }

    const fds: Fds = { stdin };
    const argv = await expandWord(node.argv, { ...this.state, env: localEnv }, this);
    for (const redir of node.redirs) {
      await applyRedirection(redir, fds, { ...this.state, env: localEnv }, this);
    }

    if (argv.length === 0) {
      Object.assign(this.state.env, localEnv);
      return ok("");
    }

    const command = this.commands.get(argv[0]);
    if (!command) return fail(`${argv[0]}: command not found`);

    const ctx: ShellCommandContext = {
      args: argv.slice(1),
      stdin: fds.stdin,
      cwd: this.state.cwd,
      env: localEnv,
      vfs: this.vfs,
      shell: this,
      setCwd: (path) => {
        this.state.cwd = normalizePath(path, this.state.cwd);
        this.state.env.PWD = this.state.cwd;
      },
    };
    let result = await command(ctx);
    result = await flushRedirections(result, fds, this.vfs, this.state.cwd);
    return result;
  }
}

function tokenize(script: string): Token[] {
  const tokens: Token[] = [];
  let parts: WordPart[] = [];
  let current = "";
  let quote: WordPart["quote"] = "none";
  let wordStarted = false;
  const operators = ["2>>", "2>&1", "1>&2", "&&", "||", ">>", "<<-", "<<", ">|", "&>", "2>", "<>", "|", ";", ">", "<"];

  function pushPart() {
    if (current) parts.push({ text: current, quote });
    current = "";
  }

  function pushWord() {
    pushPart();
    if (parts.length || wordStarted) tokens.push({ type: "word", parts });
    parts = [];
    wordStarted = false;
  }

  for (let i = 0; i < script.length; i++) {
    const char = script[i];
    if (quote === "none" && char === "#") {
      while (i < script.length && script[i] !== "\n") i++;
      continue;
    }
    if (quote === "none" && /\s/.test(char)) {
      pushWord();
      continue;
    }
    if (quote === "none") {
      const op = operators.find((candidate) => script.startsWith(candidate, i));
      if (op) {
        pushWord();
        tokens.push({ type: "op", value: op });
        i += op.length - 1;
        continue;
      }
    }
    if (char === "'" && quote !== "double") {
      wordStarted = true;
      pushPart();
      quote = quote === "single" ? "none" : "single";
      continue;
    }
    if (char === '"' && quote !== "single") {
      wordStarted = true;
      pushPart();
      quote = quote === "double" ? "none" : "double";
      continue;
    }
    if (char === "\\" && quote !== "single") {
      current += script[++i] ?? "";
      wordStarted = true;
      continue;
    }
    if (char === "$" && quote !== "single" && script[i + 1] === "(") {
      const end = findExpansionEnd(script, i);
      if (end > i) {
        current += script.slice(i, end + 1);
        wordStarted = true;
        i = end;
        continue;
      }
    }
    current += char;
    wordStarted = true;
  }
  pushWord();
  return tokens;
}

function findExpansionEnd(script: string, start: number): number {
  const arithmetic = script[start + 2] === "(";
  let depth = arithmetic ? 2 : 1;
  for (let i = start + (arithmetic ? 3 : 2); i < script.length; i++) {
    if (script[i] === "(") depth++;
    if (script[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseSegments(tokens: Token[]): SegmentNode[] {
  const segments: SegmentNode[] = [];
  let connector: SegmentNode["connector"] = ";";
  let current: Token[] = [];

  for (const token of tokens) {
    if (token.type === "op" && (token.value === ";" || token.value === "&&" || token.value === "||")) {
      if (current.length) segments.push({ connector, pipeline: parsePipeline(current) });
      connector = token.value;
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length) segments.push({ connector, pipeline: parsePipeline(current) });
  return segments;
}

function parsePipeline(tokens: Token[]): PipelineNode {
  const commands: CommandNode[] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.type === "op" && token.value === "|") {
      commands.push(parseCommand(current));
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length) commands.push(parseCommand(current));
  return { commands };
}

function parseCommand(tokens: Token[]): CommandNode {
  const argv: Token[] = [];
  const redirs: Redirection[] = [];
  const assignments: Record<string, string> = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "op" && isRedirectionOp(token.value)) {
      let target: Token | undefined;
      if (token.value === "2>&1") target = wordToken("1");
      else if (token.value === "1>&2") target = wordToken("2");
      else target = tokens[++i];
      if (!target || target.type !== "word") throw new Error(`Missing redirection target for ${token.value}`);
      redirs.push(redirectionFrom(token.value, target));
      continue;
    }
    if (token.type === "word" && argv.length === 0) {
      const text = literalWord(token);
      const assignment = text.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (assignment) {
        assignments[assignment[1]] = assignment[2];
        continue;
      }
    }
    argv.push(token);
  }

  return { argv, redirs, assignments };
}

function isRedirectionOp(value: string): boolean {
  return [">", ">>", "<", "<>", ">|", "2>", "2>>", "2>&1", "1>&2", "&>", "<<", "<<-"].includes(value);
}

function redirectionFrom(op: string, target: Token): Redirection {
  if (op === "2>" || op === "2>>") return { fd: 2, op: op === "2>" ? ">" : ">>", target };
  if (op === "2>&1") return { fd: 2, op: ">&", target };
  if (op === "1>&2") return { fd: 1, op: ">&", target };
  if (op === "&>") return { fd: 1, op: "&>", target };
  if (op === "<" || op === "<>" || op === "<<" || op === "<<-") return { fd: 0, op: op as Redirection["op"], target };
  return { fd: 1, op: op as Redirection["op"], target };
}

async function applyRedirection(redir: Redirection, fds: Fds, state: RuntimeState, shell: JsShellImpl): Promise<void> {
  const target = await expandScalar(redir.target, state, shell);
  if (redir.op === ">&") {
    if (redir.fd === 2 && target === "1") fds.mergeStderrToStdout = true;
    if (redir.fd === 1 && target === "2") fds.mergeStdoutToStderr = true;
    return;
  }
  if (redir.op === "&>") {
    fds.stdoutPath = target;
    fds.stderrPath = target;
    return;
  }
  if (redir.fd === 0) {
    if (redir.op === "<<" || redir.op === "<<-") fds.stdin = target;
    else fds.stdin = await shell.vfs.readText(normalizePath(target, state.cwd));
    return;
  }
  if (redir.fd === 2) {
    fds.stderrPath = target;
    fds.stderrAppend = redir.op === ">>";
    return;
  }
  fds.stdoutPath = target;
  fds.stdoutAppend = redir.op === ">>";
}

async function flushRedirections(result: ShellResult, fds: Fds, vfs: AsyncVFS, cwd: string): Promise<ShellResult> {
  let stdout = result.stdout;
  let stderr = result.stderr;
  if (fds.mergeStderrToStdout) {
    stdout += stderr;
    stderr = "";
  }
  if (fds.mergeStdoutToStderr) {
    stderr += stdout;
    stdout = "";
  }
  if (fds.stdoutPath) {
    const path = normalizePath(fds.stdoutPath, cwd);
    if (fds.stdoutAppend) await vfs.appendFile(path, stdout);
    else await vfs.writeText(path, stdout);
    stdout = "";
  }
  if (fds.stderrPath) {
    const path = normalizePath(fds.stderrPath, cwd);
    if (fds.stderrAppend) await vfs.appendFile(path, stderr);
    else await vfs.writeText(path, stderr);
    stderr = "";
  }
  return { ...result, stdout, stderr };
}

async function expandWord(tokens: Token[], state: RuntimeState, shell: JsShellImpl): Promise<string[]> {
  const words: string[] = [];
  for (const token of tokens) {
    if (!isWordToken(token)) continue;
    const scalar = await expandScalar(token, state, shell);
    const hasUnquotedGlob = token.parts.some((part) => part.quote === "none" && /[*?[]/.test(part.text));
    if (hasUnquotedGlob) {
      const matches = await glob(scalar, state.cwd, shell.vfs);
      words.push(...(matches.length ? matches : [scalar]));
    } else {
      words.push(scalar);
    }
  }
  return words;
}

async function expandScalar(token: Token, state: RuntimeState, shell: JsShellImpl): Promise<string> {
  if (!isWordToken(token)) return "";
  let value = "";
  for (const part of token.parts) {
    if (part.quote === "single") value += part.text;
    else value += await expandText(part.text, state, shell);
  }
  return value;
}

async function expandText(text: string, state: RuntimeState, shell: JsShellImpl): Promise<string> {
  let value = text;
  value = value.replace(/\$\(\(([^)]+)\)\)/g, (_all, expr: string) => {
    const safe = expr.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (name) => state.env[name] ?? "0");
    if (!/^[0-9+\-*/%() <>=!&|.]+$/.test(safe)) return "0";
    try {
      return String(Function(`"use strict"; return (${safe})`)());
    } catch {
      return "0";
    }
  });

  for (const match of [...value.matchAll(/\$\(([^()]*)\)/g)]) {
    const result = await shell.exec(match[1], { cwd: state.cwd, env: state.env });
    value = value.replace(match[0], result.stdout.replace(/\n+$/, ""));
  }

  value = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:-|:=|:\?|:\+)([^}]*))?\}/g, (_all, name: string, op: string | undefined, arg: string | undefined) => {
    const current = state.env[name] ?? "";
    if (!op) return current;
    if (op === ":-") return current || (arg ?? "");
    if (op === ":=") {
      if (!current) state.env[name] = arg ?? "";
      return state.env[name];
    }
    if (op === ":?") {
      if (!current) throw new Error(arg || `${name}: parameter null or not set`);
      return current;
    }
    if (op === ":+") return current ? (arg ?? "") : "";
    return current;
  });
  value = value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_all, name: string) => state.env[name] ?? "");
  value = value.replace(/\$([0-9])/g, "");
  value = value.replace(/\$\?/g, state.env["?"] ?? "0");
  return value;
}

async function glob(pattern: string, cwd: string, vfs: AsyncVFS): Promise<string[]> {
  const slash = pattern.lastIndexOf("/");
  const base = slash >= 0 ? pattern.slice(0, slash) || "/" : ".";
  const name = slash >= 0 ? pattern.slice(slash + 1) : pattern;
  const dir = normalizePath(base, cwd);
  const regex = new RegExp(`^${name.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  try {
    const entries = await vfs.listDir(dir);
    return entries.filter((entry) => regex.test(entry.name)).map((entry) => base === "." ? entry.name : `${base}/${entry.name}`).sort();
  } catch {
    return [];
  }
}

function ok(stdout: string): ShellResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr: string): ShellResult {
  return { exitCode: 1, stdout: "", stderr: `${stderr}\n` };
}

function isWordToken(token: Token): token is Extract<Token, { type: "word" }> {
  return token.type === "word";
}

function wordToken(text: string): Token {
  return { type: "word", parts: [{ text, quote: "none" }] };
}

function literalWord(token: Extract<Token, { type: "word" }>): string {
  return token.parts.map((part) => part.text).join("");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Shell execution timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
