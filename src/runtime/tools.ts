import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { normalizePath } from "./path";
import type { BrowserToolDefinition, BrowserVFS, ShellAdapter } from "./types";

export const allToolNames = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
export const defaultActiveToolNames = ["read", "bash", "edit", "write"];

export function createBuiltInTools(ctx: { vfs: BrowserVFS; shell: ShellAdapter; cwd: string }): Record<string, AgentTool<any>> {
  return {
    read: readTool(ctx),
    bash: bashTool(ctx),
    edit: editTool(ctx),
    write: writeTool(ctx),
    grep: grepTool(ctx),
    find: findTool(ctx),
    ls: lsTool(ctx),
  };
}

export function wrapCustomTool(tool: BrowserToolDefinition, ctx: { vfs: BrowserVFS; shell: ShellAdapter; cwd: string }): AgentTool<any> {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    async execute(_toolCallId, params, signal) {
      const result = await tool.execute({ args: params, vfs: ctx.vfs, shell: ctx.shell, cwd: ctx.cwd, signal });
      return {
        content: result.content,
        details: result.details ?? {},
      };
    },
  };
}

function readTool(ctx: { vfs: BrowserVFS; cwd: string }): AgentTool<any> {
  return {
    name: "read",
    label: "read",
    description: "Read a UTF-8 text file from the browser workspace. Supports optional 1-based line offset and limit.",
    parameters: Type.Object({
      path: Type.String(),
      offset: Type.Optional(Type.Number()),
      limit: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params) {
      const args = params as { path: string; offset?: number; limit?: number };
      const text = await ctx.vfs.readText(normalizePath(args.path, ctx.cwd));
      const lines = text.split("\n");
      const start = Math.max(0, (args.offset ?? 1) - 1);
      const end = args.limit ? start + args.limit : lines.length;
      const selected = lines.slice(start, end).join("\n");
      return {
        content: [{ type: "text", text: selected }],
        details: { path: normalizePath(args.path, ctx.cwd), totalLines: lines.length, returnedLines: Math.max(0, end - start) },
      };
    },
  };
}

function writeTool(ctx: { vfs: BrowserVFS; cwd: string }): AgentTool<any> {
  return {
    name: "write",
    label: "write",
    description: "Create or overwrite a UTF-8 text file in the browser workspace.",
    parameters: Type.Object({
      path: Type.String(),
      content: Type.String(),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const args = params as { path: string; content: string };
      const path = normalizePath(args.path, ctx.cwd);
      await ctx.vfs.writeText(path, args.content);
      return {
        content: [{ type: "text", text: `Wrote ${path}` }],
        details: { path, bytes: new TextEncoder().encode(args.content).byteLength },
      };
    },
  };
}

function editTool(ctx: { vfs: BrowserVFS; cwd: string }): AgentTool<any> {
  return {
    name: "edit",
    label: "edit",
    description: "Replace exact text in a UTF-8 file. Fails when oldText is not found.",
    parameters: Type.Object({
      path: Type.String(),
      oldText: Type.String(),
      newText: Type.String(),
      replaceAll: Type.Optional(Type.Boolean()),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const args = params as { path: string; oldText: string; newText: string; replaceAll?: boolean };
      const path = normalizePath(args.path, ctx.cwd);
      const text = await ctx.vfs.readText(path);
      if (!text.includes(args.oldText)) {
        throw new Error(`oldText not found in ${path}`);
      }
      const next = args.replaceAll
        ? text.split(args.oldText).join(args.newText)
        : text.replace(args.oldText, args.newText);
      await ctx.vfs.writeText(path, next);
      return {
        content: [{ type: "text", text: `Edited ${path}` }],
        details: { path, replacements: args.replaceAll ? text.split(args.oldText).length - 1 : 1 },
      };
    },
  };
}

function bashTool(ctx: { shell: ShellAdapter; cwd: string }): AgentTool<any> {
  return {
    name: "bash",
    label: "bash",
    description: "Run a shell command inside the browser VFS sandbox.",
    parameters: Type.Object({
      command: Type.String(),
      timeoutMs: Type.Optional(Type.Number()),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal) {
      const args = params as { command: string; timeoutMs?: number };
      const result = await ctx.shell.exec(args.command, { cwd: ctx.cwd, timeoutMs: args.timeoutMs ?? 10_000, signal });
      const text = [
        result.stdout ? `stdout:\n${result.stdout}` : "",
        result.stderr ? `stderr:\n${result.stderr}` : "",
        `exitCode: ${result.exitCode}`,
      ].filter(Boolean).join("\n\n");
      return {
        content: [{ type: "text", text }],
        details: result,
      };
    },
  };
}

function grepTool(ctx: { shell: ShellAdapter; cwd: string }): AgentTool<any> {
  return {
    name: "grep",
    label: "grep",
    description: "Search text in the workspace using grep -R.",
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, signal) {
      const args = params as { pattern: string; path?: string };
      const target = args.path ?? ".";
      const result = await ctx.shell.exec(`grep -R ${quote(args.pattern)} ${quote(target)}`, { cwd: ctx.cwd, signal });
      return { content: [{ type: "text", text: result.stdout || result.stderr }], details: result };
    },
  };
}

function findTool(ctx: { shell: ShellAdapter; cwd: string }): AgentTool<any> {
  return {
    name: "find",
    label: "find",
    description: "List files and directories in the workspace.",
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
      type: Type.Optional(Type.Union([Type.Literal("file"), Type.Literal("directory")])),
    }),
    async execute(_toolCallId, params, signal) {
      const args = params as { path?: string; type?: "file" | "directory" };
      const flag = args.type === "file" ? " -type f" : args.type === "directory" ? " -type d" : "";
      const result = await ctx.shell.exec(`find ${quote(args.path ?? ".")}${flag}`, { cwd: ctx.cwd, signal });
      return { content: [{ type: "text", text: result.stdout || result.stderr }], details: result };
    },
  };
}

function lsTool(ctx: { shell: ShellAdapter; cwd: string }): AgentTool<any> {
  return {
    name: "ls",
    label: "ls",
    description: "List direct children of a workspace directory.",
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, signal) {
      const args = params as { path?: string };
      const result = await ctx.shell.exec(`ls ${quote(args.path ?? ".")}`, { cwd: ctx.cwd, signal });
      return { content: [{ type: "text", text: result.stdout || result.stderr }], details: result };
    },
  };
}

function quote(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}
