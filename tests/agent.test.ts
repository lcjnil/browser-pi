import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAssistantMessageEventStream, getModel } from "@earendil-works/pi-ai";
import { createAgentSession, createMemoryVFS } from "../src/runtime";

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    streamSimple: vi.fn((_model, context) => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const userText = context.messages
          .filter((message: any) => message.role === "user")
          .map((message: any) => {
            if (typeof message.content === "string") return message.content;
            if (Array.isArray(message.content)) {
              return message.content
                .filter((part: any) => part.type === "text")
                .map((part: any) => part.text ?? "")
                .join("\n");
            }
            return "";
          })
          .join("\n");
        const hasToolResult = context.messages.some((message: any) => message.role === "toolResult");
        if (userText.includes("please think")) {
          pushThinkingMessage(stream);
          return;
        }

        const message = userText.includes("please edit") && !hasToolResult
          ? assistantWithToolCall("edit", {
            path: "README.md",
            oldText: "MARKER",
            newText: "Done",
          })
          : assistantStopMessage();
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: message.stopReason === "toolUse" ? "toolUse" : "stop", message });
      });
      return stream;
    }),
  };
});

describe("browser agent session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes model-requested tool calls against the VFS", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/README.md": "MARKER\n" } });
    const { session } = await createAgentSession({
      model: {
        ...getModel("moonshotai", "kimi-k2.6"),
        baseUrl: "https://api.msh.team/v1",
      },
      apiKey: "test",
      vfs,
    });

    await session.prompt("please edit");

    expect(await vfs.readText("/workspace/README.md")).toBe("Done\n");
    expect(session.getMessages().some((message: any) => message.role === "toolResult")).toBe(true);
  });

  it("streams and stores thinking content", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/README.md": "MARKER\n" } });
    const { session } = await createAgentSession({
      model: {
        ...getModel("moonshotai", "kimi-k2.6"),
        baseUrl: "https://api.msh.team/v1",
      },
      apiKey: "test",
      vfs,
    });
    const events: any[] = [];
    session.subscribe((event) => {
      events.push(event);
    });

    await session.prompt("please think");

    expect(events.some((event) =>
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "thinking_delta" &&
      event.assistantMessageEvent.delta === "ing",
    )).toBe(true);
    expect(session.getMessages().some((message: any) =>
      message.role === "assistant" &&
      message.content?.some((part: any) => part.type === "thinking" && part.thinking === "Thinking"),
    )).toBe(true);
  });
});

function pushThinkingMessage(stream: any) {
  const started = assistantStopMessage([{ type: "thinking", thinking: "" }]);
  const partialThinking = assistantStopMessage([{ type: "thinking", thinking: "Think" }]);
  const finalThinking = assistantStopMessage([{ type: "thinking", thinking: "Thinking" }]);
  const partialText = assistantStopMessage([
    { type: "thinking", thinking: "Thinking" },
    { type: "text", text: "Done" },
  ]);
  const finalMessage = assistantStopMessage([
    { type: "thinking", thinking: "Thinking" },
    { type: "text", text: "Done." },
  ]);

  stream.push({ type: "start", partial: started });
  stream.push({ type: "thinking_start", contentIndex: 0, partial: started });
  stream.push({ type: "thinking_delta", contentIndex: 0, delta: "Think", partial: partialThinking });
  stream.push({ type: "thinking_delta", contentIndex: 0, delta: "ing", partial: finalThinking });
  stream.push({ type: "thinking_end", contentIndex: 0, content: "Thinking", partial: finalThinking });
  stream.push({ type: "text_start", contentIndex: 1, partial: partialText });
  stream.push({ type: "text_delta", contentIndex: 1, delta: "Done", partial: partialText });
  stream.push({ type: "text_delta", contentIndex: 1, delta: ".", partial: finalMessage });
  stream.push({ type: "text_end", contentIndex: 1, content: "Done.", partial: finalMessage });
  stream.push({ type: "done", reason: "stop", message: finalMessage });
}

function assistantWithToolCall(name: string, args: Record<string, unknown>): any {
  return {
    role: "assistant",
    content: [{
      type: "toolCall",
      id: "tool-1",
      name,
      arguments: args,
    }],
    api: "openai-responses",
    provider: "openai",
    model: "fake",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}

function assistantStopMessage(content: any[] = [{ type: "text", text: "Done." }]): any {
  return {
    role: "assistant",
    content,
    api: "openai-responses",
    provider: "openai",
    model: "fake",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}
