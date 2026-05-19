import { basename, dirname, normalizePath } from "./path";
import type { BrowserVFS, VFSEntry, VFSSnapshot, VFSStat } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface FileNode {
  data: Uint8Array;
  mtimeMs: number;
}

export interface CreateMemoryVFSOptions {
  cwd?: string;
  files?: Record<string, string | Uint8Array>;
  dirs?: string[];
}

export function createMemoryVFS(options: CreateMemoryVFSOptions = {}): BrowserVFS {
  return new MemoryVFS(options);
}

class MemoryVFS implements BrowserVFS {
  cwd: string;
  private readonly files = new Map<string, FileNode>();
  private readonly dirs = new Set<string>(["/"]);

  constructor(options: CreateMemoryVFSOptions) {
    this.cwd = normalizePath(options.cwd ?? "/workspace", "/");
    this.ensureDir(this.cwd);

    for (const dir of options.dirs ?? []) {
      this.ensureDir(normalizePath(dir, this.cwd));
    }

    for (const [path, content] of Object.entries(options.files ?? {})) {
      const normalized = normalizePath(path, this.cwd);
      this.ensureDir(dirname(normalized));
      this.files.set(normalized, {
        data: toBytes(content),
        mtimeMs: Date.now(),
      });
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const normalized = normalizePath(path, this.cwd);
    const file = this.files.get(normalized);
    if (!file) throw new Error(`File not found: ${normalized}`);
    return new Uint8Array(file.data);
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const normalized = normalizePath(path, this.cwd);
    this.ensureDir(dirname(normalized));
    this.files.set(normalized, { data: toBytes(data), mtimeMs: Date.now() });
  }

  async appendFile(path: string, data: string | Uint8Array): Promise<void> {
    const current = (await this.exists(path)) ? await this.readFile(path) : new Uint8Array();
    const next = toBytes(data);
    const merged = new Uint8Array(current.length + next.length);
    merged.set(current);
    merged.set(next, current.length);
    await this.writeFile(path, merged);
  }

  async readText(path: string): Promise<string> {
    return decoder.decode(await this.readFile(path));
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeFile(path, text);
  }

  async listDir(path: string): Promise<VFSEntry[]> {
    const normalized = normalizePath(path, this.cwd);
    if (!this.dirs.has(normalized)) throw new Error(`Directory not found: ${normalized}`);

    const entries = new Map<string, VFSEntry>();
    for (const dir of this.dirs) {
      if (dir === normalized || dirname(dir) !== normalized) continue;
      entries.set(dir, {
        name: basename(dir),
        path: dir,
        kind: "directory",
        size: 0,
        mtimeMs: Date.now(),
      });
    }
    for (const [filePath, file] of this.files) {
      if (dirname(filePath) !== normalized) continue;
      entries.set(filePath, {
        name: basename(filePath),
        path: filePath,
        kind: "file",
        size: file.data.byteLength,
        mtimeMs: file.mtimeMs,
      });
    }
    return Array.from(entries.values()).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async stat(path: string): Promise<VFSStat> {
    const normalized = normalizePath(path, this.cwd);
    const file = this.files.get(normalized);
    if (file) {
      return { path: normalized, kind: "file", size: file.data.byteLength, mtimeMs: file.mtimeMs };
    }
    if (this.dirs.has(normalized)) {
      return { path: normalized, kind: "directory", size: 0, mtimeMs: Date.now() };
    }
    throw new Error(`Path not found: ${normalized}`);
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path, this.cwd);
    return this.files.has(normalized) || this.dirs.has(normalized);
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
    const existed = this.files.delete(normalized);
    if (this.dirs.has(normalized)) {
      const children = [...this.dirs, ...this.files.keys()].filter((child) => child !== normalized && child.startsWith(`${normalized}/`));
      if (children.length > 0 && !options.recursive) {
        throw new Error(`Directory is not empty: ${normalized}`);
      }
      for (const child of children) {
        this.dirs.delete(child);
        this.files.delete(child);
      }
      if (normalized !== "/") this.dirs.delete(normalized);
      return;
    }
    if (!existed && !options.force) throw new Error(`Path not found: ${normalized}`);
  }

  async exportSnapshot(): Promise<VFSSnapshot> {
    const files: Record<string, string> = {};
    for (const [path, file] of this.files) {
      files[path] = bytesToBase64(file.data);
    }
    return {
      version: 1,
      cwd: this.cwd,
      files,
      dirs: Array.from(this.dirs).sort(),
    };
  }

  async importSnapshot(snapshot: VFSSnapshot): Promise<void> {
    if (snapshot.version !== 1) throw new Error(`Unsupported VFS snapshot version: ${snapshot.version}`);
    this.files.clear();
    this.dirs.clear();
    for (const dir of snapshot.dirs) this.ensureDir(dir);
    this.cwd = normalizePath(snapshot.cwd, "/");
    this.ensureDir(this.cwd);
    for (const [path, data] of Object.entries(snapshot.files)) {
      const normalized = normalizePath(path, this.cwd);
      this.ensureDir(dirname(normalized));
      this.files.set(normalized, { data: base64ToBytes(data), mtimeMs: Date.now() });
    }
  }

  private ensureDir(path: string): void {
    const normalized = normalizePath(path, "/");
    const parts = normalized.split("/").filter(Boolean);
    let current = "/";
    this.dirs.add(current);
    for (const part of parts) {
      current = current === "/" ? `/${part}` : `${current}/${part}`;
      this.dirs.add(current);
    }
  }
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
