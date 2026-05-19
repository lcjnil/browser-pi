import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type { Static, TSchema } from "typebox";

export type BrowserAgentEvent = AgentEvent;
export type BrowserAgentMessage = AgentMessage;

export interface VFSEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number;
  mtimeMs: number;
}

export interface VFSStat {
  path: string;
  kind: "file" | "directory";
  size: number;
  mtimeMs: number;
}

export interface VFSSnapshot {
  version: 1;
  cwd: string;
  files: Record<string, string>;
  dirs: string[];
}

export interface BrowserVFS {
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
  exportSnapshot(): Promise<VFSSnapshot>;
  importSnapshot(snapshot: VFSSnapshot): Promise<void>;
}

export interface ShellAdapter {
  exec(
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      signal?: AbortSignal;
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  cleanup(): Promise<void>;
}

export interface BrowserToolDefinition<TParams extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParams;
  promptSnippet?: string;
  execute(ctx: {
    args: Static<TParams>;
    vfs: BrowserVFS;
    shell: ShellAdapter;
    cwd: string;
    signal?: AbortSignal;
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
    details?: unknown;
    isError?: boolean;
  }>;
}

export interface BrowserSkill {
  name: string;
  description: string;
  content: string;
  filePath?: string;
  disableModelInvocation?: boolean;
}

export interface CreateBrowserAgentSessionOptions {
  model: Model<any>;
  apiKey?: string;
  getApiKey?: (provider: string) => string | Promise<string | undefined> | undefined;
  thinkingLevel?: "off" | ThinkingLevel;
  cwd?: string;
  vfs?: BrowserVFS;
  shell?: ShellAdapter;
  tools?: string[];
  noTools?: "all";
  customTools?: BrowserToolDefinition[];
  skills?: BrowserSkill[];
  systemPrompt?: string;
  appendSystemPrompt?: string;
}

export interface BrowserAgentSession {
  prompt(input: string): Promise<void>;
  continue(): Promise<void>;
  abort(): void;
  dispose(): Promise<void>;
  subscribe(listener: (event: BrowserAgentEvent) => void | Promise<void>): () => void;
  getMessages(): BrowserAgentMessage[];
  getActiveToolNames(): string[];
  setActiveToolNames(names: string[]): void;
  vfs: BrowserVFS;
}

export interface BrowserAgentRuntime {
  vfs: BrowserVFS;
  shell: ShellAdapter;
}
