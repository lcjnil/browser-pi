import { basename, dirname, normalizePath } from "./path";
import type {
  AsyncVFS,
  CreateMemoryVFSOptions,
  VFSEntry,
  VFSSnapshot,
  VFSStat,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface FileNode {
  data: Uint8Array;
  mode: number;
  mtimeMs: number;
}

interface DirNode {
  mode: number;
  mtimeMs: number;
}

interface SymlinkNode {
  target: string;
  mode: number;
  mtimeMs: number;
}

export function createMemoryVFS(options: CreateMemoryVFSOptions = {}): AsyncVFS {
  return new MemoryVFS(options);
}

class MemoryVFS implements AsyncVFS {
  cwd: string;
  private readonly files = new Map<string, FileNode>();
  private readonly dirs = new Map<string, DirNode>();
  private readonly symlinks = new Map<string, SymlinkNode>();

  constructor(options: CreateMemoryVFSOptions) {
    this.cwd = normalizePath(options.cwd ?? "/workspace", "/");
    this.ensureDir("/");
    this.ensureDir(this.cwd);

    for (const dir of options.dirs ?? []) this.ensureDir(normalizePath(dir, this.cwd));
    for (const [path, content] of Object.entries(options.files ?? {})) {
      const normalized = normalizePath(path, this.cwd);
      this.ensureDir(dirname(normalized));
      this.files.set(normalized, { data: toBytes(content), mode: 0o644, mtimeMs: Date.now() });
    }
    for (const [path, target] of Object.entries(options.symlinks ?? {})) {
      const normalized = normalizePath(path, this.cwd);
      this.ensureDir(dirname(normalized));
      this.symlinks.set(normalized, { target, mode: 0o777, mtimeMs: Date.now() });
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const normalized = await this.resolvePath(path);
    const file = this.files.get(normalized);
    if (!file) throw new Error(`File not found: ${normalized}`);
    return new Uint8Array(file.data);
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const normalized = normalizePath(path, this.cwd);
    this.ensureDir(dirname(normalized));
    this.symlinks.delete(normalized);
    this.files.set(normalized, { data: toBytes(data), mode: 0o644, mtimeMs: Date.now() });
  }

  async appendFile(path: string, data: string | Uint8Array): Promise<void> {
    const normalized = normalizePath(path, this.cwd);
    const current = await this.exists(normalized) ? await this.readFile(normalized) : new Uint8Array();
    const next = toBytes(data);
    const merged = new Uint8Array(current.length + next.length);
    merged.set(current);
    merged.set(next, current.length);
    await this.writeFile(normalized, merged);
  }

  async readText(path: string): Promise<string> {
    return decoder.decode(await this.readFile(path));
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeFile(path, text);
  }

  async listDir(path: string): Promise<VFSEntry[]> {
    const normalized = await this.resolvePath(path);
    if (!this.dirs.has(normalized)) throw new Error(`Directory not found: ${normalized}`);

    const entries = new Map<string, VFSEntry>();
    for (const [dir, node] of this.dirs) {
      if (dir === normalized || dirname(dir) !== normalized) continue;
      entries.set(dir, {
        name: basename(dir),
        path: dir,
        kind: "directory",
        size: 0,
        mode: node.mode,
        mtimeMs: node.mtimeMs,
      });
    }
    for (const [filePath, node] of this.files) {
      if (dirname(filePath) !== normalized) continue;
      entries.set(filePath, {
        name: basename(filePath),
        path: filePath,
        kind: "file",
        size: node.data.byteLength,
        mode: node.mode,
        mtimeMs: node.mtimeMs,
      });
    }
    for (const [linkPath, node] of this.symlinks) {
      if (dirname(linkPath) !== normalized) continue;
      entries.set(linkPath, {
        name: basename(linkPath),
        path: linkPath,
        kind: "symlink",
        size: node.target.length,
        mode: node.mode,
        mtimeMs: node.mtimeMs,
      });
    }
    return [...entries.values()].sort((a, b) => {
      if (a.kind !== b.kind) return kindRank(a.kind) - kindRank(b.kind);
      return a.name.localeCompare(b.name);
    });
  }

  async stat(path: string): Promise<VFSStat> {
    const normalized = normalizePath(path, this.cwd);
    const link = this.symlinks.get(normalized);
    if (link) return { path: normalized, kind: "symlink", size: link.target.length, mode: link.mode, mtimeMs: link.mtimeMs };
    const resolved = await this.resolvePath(normalized);
    const file = this.files.get(resolved);
    if (file) return { path: resolved, kind: "file", size: file.data.byteLength, mode: file.mode, mtimeMs: file.mtimeMs };
    const dir = this.dirs.get(resolved);
    if (dir) return { path: resolved, kind: "directory", size: 0, mode: dir.mode, mtimeMs: dir.mtimeMs };
    throw new Error(`Path not found: ${normalized}`);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, options: { recursive?: boolean } = {}): Promise<void> {
    const normalized = normalizePath(path, this.cwd);
    if (options.recursive === false && !this.dirs.has(dirname(normalized))) {
      throw new Error(`Parent directory not found: ${dirname(normalized)}`);
    }
    this.ensureDir(normalized);
  }

  async remove(path: string, options: { recursive?: boolean; force?: boolean } = {}): Promise<void> {
    const normalized = normalizePath(path, this.cwd);
    const removed = this.files.delete(normalized) || this.symlinks.delete(normalized);
    if (this.dirs.has(normalized)) {
      const children = [...this.dirs.keys(), ...this.files.keys(), ...this.symlinks.keys()].filter(
        (child) => child !== normalized && child.startsWith(`${normalized}/`),
      );
      if (children.length && !options.recursive) throw new Error(`Directory is not empty: ${normalized}`);
      for (const child of children) {
        this.files.delete(child);
        this.symlinks.delete(child);
        this.dirs.delete(child);
      }
      if (normalized !== "/") this.dirs.delete(normalized);
      return;
    }
    if (!removed && !options.force) throw new Error(`Path not found: ${normalized}`);
  }

  async symlink(target: string, path: string): Promise<void> {
    const normalized = normalizePath(path, this.cwd);
    this.ensureDir(dirname(normalized));
    this.files.delete(normalized);
    this.symlinks.set(normalized, { target, mode: 0o777, mtimeMs: Date.now() });
  }

  async readlink(path: string): Promise<string> {
    const normalized = normalizePath(path, this.cwd);
    const link = this.symlinks.get(normalized);
    if (!link) throw new Error(`Not a symlink: ${normalized}`);
    return link.target;
  }

  async exportSnapshot(): Promise<VFSSnapshot> {
    const files: Record<string, string> = {};
    for (const [path, file] of this.files) files[path] = bytesToBase64(file.data);
    const symlinks: Record<string, string> = {};
    for (const [path, link] of this.symlinks) symlinks[path] = link.target;
    return { version: 1, cwd: this.cwd, files, dirs: [...this.dirs.keys()].sort(), symlinks };
  }

  async importSnapshot(snapshot: VFSSnapshot): Promise<void> {
    if (snapshot.version !== 1) throw new Error(`Unsupported VFS snapshot version: ${snapshot.version}`);
    this.files.clear();
    this.dirs.clear();
    this.symlinks.clear();
    for (const dir of snapshot.dirs) this.ensureDir(dir);
    this.cwd = normalizePath(snapshot.cwd, "/");
    this.ensureDir(this.cwd);
    for (const [path, data] of Object.entries(snapshot.files)) {
      const normalized = normalizePath(path, this.cwd);
      this.ensureDir(dirname(normalized));
      this.files.set(normalized, { data: base64ToBytes(data), mode: 0o644, mtimeMs: Date.now() });
    }
    for (const [path, target] of Object.entries(snapshot.symlinks ?? {})) {
      const normalized = normalizePath(path, this.cwd);
      this.ensureDir(dirname(normalized));
      this.symlinks.set(normalized, { target, mode: 0o777, mtimeMs: Date.now() });
    }
  }

  private ensureDir(path: string): void {
    const normalized = normalizePath(path, "/");
    const parts = normalized.split("/").filter(Boolean);
    let current = "/";
    if (!this.dirs.has(current)) this.dirs.set(current, { mode: 0o755, mtimeMs: Date.now() });
    for (const part of parts) {
      current = current === "/" ? `/${part}` : `${current}/${part}`;
      if (!this.dirs.has(current)) this.dirs.set(current, { mode: 0o755, mtimeMs: Date.now() });
    }
  }

  private async resolvePath(path: string, seen = new Set<string>()): Promise<string> {
    const normalized = normalizePath(path, this.cwd);
    const link = this.symlinks.get(normalized);
    if (!link) return normalized;
    if (seen.has(normalized)) throw new Error(`Symlink loop: ${normalized}`);
    seen.add(normalized);
    return this.resolvePath(normalizePath(link.target, dirname(normalized)), seen);
  }
}

function kindRank(kind: VFSEntry["kind"]): number {
  if (kind === "directory") return 0;
  if (kind === "symlink") return 1;
  return 2;
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? encoder.encode(data) : new Uint8Array(data);
}

function bytesToBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(data).toString("base64");
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(data: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(data, "base64"));
  const binary = atob(data);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
