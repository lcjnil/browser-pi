import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { formatSkillsForSystemPrompt } from "@earendil-works/pi-agent-core";
import { streamSimple, type Message } from "@earendil-works/pi-ai";
import { createJsShellAdapter } from "./js-shell-adapter";
import { createBuiltInTools, defaultActiveToolNames, wrapCustomTool } from "./tools";
import type {
  BrowserAgentRuntime,
  BrowserAgentSession,
  BrowserSkill,
  BrowserVFS,
  CreateBrowserAgentSessionOptions,
  ShellAdapter,
} from "./types";
import { createMemoryVFS } from "./vfs";

export async function createAgentSession(options: CreateBrowserAgentSessionOptions): Promise<{
  session: BrowserAgentSession;
  runtime: BrowserAgentRuntime;
}> {
  const cwd = options.cwd ?? "/workspace";
  const vfs = options.vfs ?? createMemoryVFS({ cwd });
  const shell = options.shell ?? createJsShellAdapter({ vfs, cwd });
  const tools = buildToolList({ vfs, shell, cwd, activeNames: resolveActiveToolNames(options), customTools: options.customTools ?? [] });
  const systemPrompt = buildSystemPrompt({ cwd, tools, skills: options.skills ?? [], systemPrompt: options.systemPrompt, appendSystemPrompt: options.appendSystemPrompt });
  const thinkingLevel = options.thinkingLevel ?? "medium";

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: options.model,
      thinkingLevel,
      tools,
    },
    convertToLlm(messages) {
      return messages as Message[];
    },
    async streamFn(model, context, streamOptions) {
      const apiKey = options.apiKey ?? await options.getApiKey?.(model.provider);
      return streamSimple(model, context, {
        ...streamOptions,
        reasoning: thinkingLevel === "off" ? undefined : thinkingLevel,
        apiKey,
      });
    },
    getApiKey: options.getApiKey,
    toolExecution: "sequential",
  });

  const session = new BrowserAgentSessionImpl(agent, vfs, shell, tools);
  return { session, runtime: { vfs, shell } };
}

class BrowserAgentSessionImpl implements BrowserAgentSession {
  constructor(
    private readonly agent: Agent,
    readonly vfs: BrowserVFS,
    private readonly shell: ShellAdapter,
    private activeTools: AgentTool<any>[],
  ) {}

  prompt(input: string): Promise<void> {
    return this.agent.prompt(input);
  }

  continue(): Promise<void> {
    return this.agent.continue();
  }

  abort(): void {
    this.agent.abort();
  }

  async dispose(): Promise<void> {
    this.agent.abort();
    await this.shell.cleanup();
  }

  subscribe(listener: Parameters<Agent["subscribe"]>[0]): () => void {
    return this.agent.subscribe(listener);
  }

  getMessages() {
    return [...this.agent.state.messages];
  }

  getActiveToolNames(): string[] {
    return this.agent.state.tools.map((tool) => tool.name);
  }

  setActiveToolNames(names: string[]): void {
    const registry = new Map(this.activeTools.map((tool) => [tool.name, tool]));
    const next = names.map((name) => registry.get(name)).filter((tool): tool is AgentTool<any> => Boolean(tool));
    this.agent.state.tools = next;
  }
}

function resolveActiveToolNames(options: CreateBrowserAgentSessionOptions): string[] {
  if (options.tools) return options.tools;
  if (options.noTools === "all") return [];
  return defaultActiveToolNames;
}

function buildToolList(options: {
  vfs: BrowserVFS;
  shell: ShellAdapter;
  cwd: string;
  activeNames: string[];
  customTools: NonNullable<CreateBrowserAgentSessionOptions["customTools"]>;
}): AgentTool<any>[] {
  const ctx = { vfs: options.vfs, shell: options.shell, cwd: options.cwd };
  const registry = new Map<string, AgentTool<any>>(Object.entries(createBuiltInTools(ctx)));
  for (const tool of options.customTools) {
    registry.set(tool.name, wrapCustomTool(tool, ctx));
  }
  return options.activeNames.map((name) => registry.get(name)).filter((tool): tool is AgentTool<any> => Boolean(tool));
}

function buildSystemPrompt(options: {
  cwd: string;
  tools: AgentTool<any>[];
  skills: BrowserSkill[];
  systemPrompt?: string;
  appendSystemPrompt?: string;
}): string {
  const snippets = options.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n") || "(none)";
  const base = options.systemPrompt ?? `You are an expert coding assistant running in browser-pi, a browser-based coding agent harness.

Available tools:
${snippets}

Guidelines:
- Prefer bash for file exploration and ordinary shell operations, but remember it is powered by the browser-local js-shell runtime.
- Only use shell commands implemented by js-shell's built-in BusyBox/Agent applets and shell subset; do not assume a full Linux, GNU coreutils, Node.js, Python, package manager, network, process, tty, or OS environment exists.
- Run "busybox --list" or "help" inside bash if you need to check which shell commands are available.
- Use read for large or precise file reads.
- Use edit/write for intentional file changes.
- Show file paths clearly when working with files.
- Be concise.`;

  const skills = options.skills.map((skill) => ({
    ...skill,
    filePath: skill.filePath ?? `/skills/${skill.name}/SKILL.md`,
  }));

  return [
    base,
    options.appendSystemPrompt,
    skills.length > 0 ? formatSkillsForSystemPrompt(skills) : undefined,
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
    `Current working directory: ${options.cwd}`,
  ].filter(Boolean).join("\n\n");
}
