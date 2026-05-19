export interface VFSEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | "symlink";
  size: number;
  mode: number;
  mtimeMs: number;
}

export interface VFSStat {
  path: string;
  kind: "file" | "directory" | "symlink";
  size: number;
  mode: number;
  mtimeMs: number;
}

export interface VFSSnapshot {
  version: 1;
  cwd: string;
  files: Record<string, string>;
  dirs: string[];
  symlinks?: Record<string, string>;
}

export interface AsyncVFS {
  cwd: string;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  appendFile(path: string, data: string | Uint8Array): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  listDir(path: string): Promise<VFSEntry[]>;
  stat(path: string): Promise<VFSStat>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  symlink(target: string, path: string): Promise<void>;
  readlink(path: string): Promise<string>;
  exportSnapshot(): Promise<VFSSnapshot>;
  importSnapshot(snapshot: VFSSnapshot): Promise<void>;
}

export interface CreateMemoryVFSOptions {
  cwd?: string;
  files?: Record<string, string | Uint8Array>;
  dirs?: string[];
  symlinks?: Record<string, string>;
}

export interface CreateJsShellOptions {
  vfs?: AsyncVFS;
  cwd?: string;
  env?: Record<string, string>;
  commands?: Record<string, ShellCommand>;
}

export interface ShellExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface JsShell {
  exec(script: string, options?: ShellExecOptions): Promise<ShellResult>;
  registerCommand(name: string, command: ShellCommand): void;
  vfs: AsyncVFS;
}

export interface ShellCommandContext {
  args: string[];
  stdin: string;
  cwd: string;
  env: Record<string, string>;
  vfs: AsyncVFS;
  shell: JsShell;
  setCwd(path: string): void;
}

export type ShellCommand = (
  ctx: ShellCommandContext,
) => Promise<ShellResult> | ShellResult;
