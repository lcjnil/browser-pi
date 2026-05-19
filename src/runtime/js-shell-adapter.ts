import { createJsShell, type AsyncVFS } from "@browser-pi/js-shell";
import type { BrowserVFS, ShellAdapter } from "./types";

export interface CreateJsShellAdapterOptions {
  vfs: BrowserVFS;
  cwd?: string;
  env?: Record<string, string>;
}

export function createJsShellAdapter(options: CreateJsShellAdapterOptions): ShellAdapter {
  const shell = createJsShell({
    vfs: toAsyncVFS(options.vfs),
    cwd: options.cwd ?? options.vfs.cwd,
    env: options.env,
  });

  return {
    async exec(command, execOptions = {}) {
      if (execOptions.signal?.aborted) throw new Error("Shell execution aborted");
      const result = await shell.exec(command, {
        cwd: execOptions.cwd,
        env: execOptions.env,
        timeoutMs: execOptions.timeoutMs,
        signal: execOptions.signal,
      });
      execOptions.onStdout?.(result.stdout);
      execOptions.onStderr?.(result.stderr);
      return result;
    },
    async cleanup() {},
  };
}

function toAsyncVFS(vfs: BrowserVFS): AsyncVFS {
  return {
    cwd: vfs.cwd,
    readFile: (path) => vfs.readFile(path),
    writeFile: (path, data) => vfs.writeFile(path, data),
    appendFile: (path, data) => vfs.appendFile(path, data),
    readText: (path) => vfs.readText(path),
    writeText: (path, text) => vfs.writeText(path, text),
    listDir: async (path) =>
      (await vfs.listDir(path)).map((entry) => ({
        ...entry,
        kind: entry.kind,
        mode: entry.kind === "directory" ? 0o755 : 0o644,
      })),
    stat: async (path) => {
      const stat = await vfs.stat(path);
      return {
        ...stat,
        kind: stat.kind,
        mode: stat.kind === "directory" ? 0o755 : 0o644,
      };
    },
    exists: (path) => vfs.exists(path),
    mkdir: (path, mkdirOptions) => vfs.mkdir(path, mkdirOptions),
    remove: (path, removeOptions) => vfs.remove(path, removeOptions),
    symlink: async () => {
      throw new Error("symlink is not supported by this VFS");
    },
    readlink: async () => {
      throw new Error("readlink is not supported by this VFS");
    },
    exportSnapshot: () => vfs.exportSnapshot(),
    importSnapshot: (snapshot) => vfs.importSnapshot(snapshot),
  };
}
