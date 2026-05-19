<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, type PropType } from "vue";
import { getModel } from "@earendil-works/pi-ai";
import { createAgentSession, createMemoryVFS, type BrowserAgentEvent, type BrowserAgentSession } from "browser-pi";
import { createDemoFiles } from "./fixtures";

const vfs = createMemoryVFS({ files: createDemoFiles() });
const session = shallowRef<BrowserAgentSession>();
const fileTree = ref<FileTreeNode[]>([]);
const selectedPath = ref("/workspace/packages/js-shell/src/shell.ts");
const selectedText = ref("");
const apiKeyStorageKey = "browser-pi.apiKey";
const modelTypeStorageKey = "browser-pi.modelType";
const modelNameStorageKey = "browser-pi.modelName";
const modelApiUrlStorageKey = "browser-pi.modelApiUrl";
const legacyModelProviderStorageKey = "browser-pi.modelProvider";
const legacyModelBaseUrlStorageKey = "browser-pi.modelBaseUrl";
const defaultModelApiUrl = `${globalThis.location?.origin ?? ""}/v1`;
const apiKey = ref(globalThis.localStorage?.getItem(apiKeyStorageKey) ?? "");
const modelType = ref(globalThis.localStorage?.getItem(modelTypeStorageKey) ?? globalThis.localStorage?.getItem(legacyModelProviderStorageKey) ?? "moonshotai");
const modelName = ref(globalThis.localStorage?.getItem(modelNameStorageKey) ?? "kimi-k2.6");
const modelApiUrl = ref(globalThis.localStorage?.getItem(modelApiUrlStorageKey) ?? globalThis.localStorage?.getItem(legacyModelBaseUrlStorageKey) ?? defaultModelApiUrl);
const prompt = ref("Explore the js-shell package, find MARKER entries, and summarize what files look most important.");
const running = ref(false);
const chatItems = ref<ChatItem[]>([]);
const showSettings = ref(false);
const settingsError = ref("");
const chatMessages = useTemplateRef<HTMLElement>("chatMessages");
let shouldAutoScrollChat = true;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
const collapsedDirs = ref(new Set<string>());
const collapsedThinkingBlocks = ref(new Set<string>());
const knownThinkingBlocks = new Set<string>();
const selectedFileName = computed(() => selectedPath.value.split("/").pop() || selectedPath.value);

interface FileTreeNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileTreeNode[];
}

interface ChatItem {
  id: string;
  role: string;
  blocks: ChatBlock[];
}

type ChatBlock =
  | { key: string; kind: "text"; text: string }
  | { key: string; kind: "thinking"; text: string; redacted: boolean }
  | { key: string; kind: "toolCall"; name: string; args: unknown };

const TreeNode = defineComponent({
  name: "TreeNode",
  props: {
    node: {
      type: Object as PropType<FileTreeNode>,
      required: true,
    },
    selectedPath: {
      type: String,
      required: true,
    },
    depth: {
      type: Number,
      required: true,
    },
  },
  emits: {
    select: (_path: string) => true,
    toggle: (_path: string) => true,
  },
  setup(props, { emit }) {
    const isCollapsed = () => props.node.kind === "directory" && props.node.children === undefined;
    return () => h("div", { class: "treeGroup" }, [
      h(
        "button",
        {
          class: ["treeNode", props.node.kind, { active: props.node.path === props.selectedPath }],
          style: { paddingLeft: `${10 + props.depth * 20}px` },
          title: props.node.path,
          onClick: () => props.node.kind === "directory" ? emit("toggle", props.node.path) : emit("select", props.node.path),
        },
        [
          h("span", { class: ["treeChevron", { collapsed: isCollapsed(), hidden: props.node.kind !== "directory" }] }, "⌄"),
          h("span", { class: "treeIcon" }, props.node.kind === "directory" ? "▣" : "▤"),
          h("span", { class: "treeName" }, props.node.name),
        ],
      ),
      ...(props.node.children ?? []).map((child) => h(TreeNode, {
        key: child.path,
        node: child,
        selectedPath: props.selectedPath,
        depth: props.depth + 1,
        onSelect: (path: string) => emit("select", path),
        onToggle: (path: string) => emit("toggle", path),
      })),
    ]);
  },
});

onMounted(async () => {
  await initSession();
  await refreshFiles();
  refreshTimer = setInterval(() => {
    void refreshFiles({ preserveEditorText: true });
  }, 1000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

async function initSession() {
  if (session.value) await session.value.dispose();
  const created = await createAgentSession({
    model: createConfiguredModel(),
    apiKey: apiKey.value,
    vfs,
    skills: [{
      name: "repo-editor",
      description: "Use when editing files in the browser workspace.",
      content: "Prefer bash for exploration. Use edit/write for intentional file changes.",
    }],
  });
  session.value = created.session;
  created.session.subscribe((event) => {
    captureChatScrollIntent();
    refreshChat(event);
    void scrollChatIfNeeded();
  });
  refreshChat();
}

function createConfiguredModel() {
  return {
    ...getModel(modelType.value as any, modelName.value),
    baseUrl: modelApiUrl.value.trim() || defaultModelApiUrl,
  };
}

async function saveSettings() {
  settingsError.value = "";
  try {
    createConfiguredModel();
    persistSetting(apiKeyStorageKey, apiKey.value.trim());
    persistSetting(modelTypeStorageKey, modelType.value.trim());
    persistSetting(modelNameStorageKey, modelName.value.trim());
    persistSetting(modelApiUrlStorageKey, modelApiUrl.value.trim());
    await initSession();
    showSettings.value = false;
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : String(error);
  }
}

function persistSetting(key: string, value: string) {
  if (value) globalThis.localStorage?.setItem(key, value);
  else globalThis.localStorage?.removeItem(key);
}

async function refreshFiles(options: { preserveEditorText?: boolean } = {}) {
  fileTree.value = await readTree("/workspace");
  if (!options.preserveEditorText && await vfs.exists(selectedPath.value)) {
    selectedText.value = await vfs.readText(selectedPath.value);
  }
}

async function selectFile(path: string) {
  const stat = await vfs.stat(path);
  if (stat.kind === "directory") return;
  selectedPath.value = path;
  if (await vfs.exists(path)) selectedText.value = await vfs.readText(path);
}

async function toggleDir(path: string) {
  const next = new Set(collapsedDirs.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  collapsedDirs.value = next;
  await refreshFiles({ preserveEditorText: true });
}

async function updateFile() {
  await vfs.writeText(selectedPath.value, selectedText.value);
  await refreshFiles();
}

async function runPrompt() {
  const input = prompt.value.trim();
  if (!input) return;
  running.value = true;
  try {
    if (!session.value) await initSession();
    prompt.value = "";
    await session.value?.prompt(input);
    refreshChat();
    await scrollChatIfNeeded();
    await refreshFiles();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    chatItems.value = [...chatItems.value, {
      id: `error:${Date.now()}`,
      role: "system",
      blocks: [{ key: `error:${Date.now()}:0`, kind: "text", text }],
    }];
  } finally {
    running.value = false;
  }
}

async function readTree(path: string): Promise<FileTreeNode[]> {
  const entries = await vfs.listDir(path);
  const nodes = await Promise.all(entries.map(async (entry) => {
    const node: FileTreeNode = {
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
    };
    if (entry.kind === "directory") {
      node.children = collapsedDirs.value.has(entry.path) ? undefined : await readTree(entry.path);
    }
    return node;
  }));
  return nodes;
}

function getMessageRole(message: unknown): string {
  if (!message || typeof message !== "object") return "message";
  return (message as { role?: string }).role ?? "message";
}

function refreshChat(event?: BrowserAgentEvent) {
  const messages = [...(session.value?.getMessages() ?? [])];
  if (event?.type === "message_update") {
    const lastIndex = messages.length - 1;
    if (lastIndex >= 0 && getMessageRole(messages[lastIndex]) === getMessageRole(event.message)) messages[lastIndex] = event.message;
    else messages.push(event.message);
  }

  const items = messages.map((message, index) => ({
    id: String(index),
    role: getMessageRole(message),
    blocks: formatChatBlocks(message, String(index)),
  })).filter((item) => item.blocks.length > 0);

  chatItems.value = items;
}

function formatChatBlocks(message: unknown, messageKey: string): ChatBlock[] {
  if (!message || typeof message !== "object") return [];
  const typed = message as {
    role?: string;
    content?: string | Array<{ type: string; text?: string; thinking?: string; redacted?: boolean; name?: string; arguments?: unknown }>;
    errorMessage?: string;
    toolName?: string;
  };

  if (typed.errorMessage) return [{ key: `${messageKey}:error`, kind: "text", text: typed.errorMessage }];
  if (typeof typed.content === "string") return typed.content.trim() ? [{ key: `${messageKey}:text`, kind: "text", text: typed.content }] : [];
  if (Array.isArray(typed.content)) {
    return typed.content.map((part, index): ChatBlock | undefined => {
      const key = `${messageKey}:${index}`;
      if (part.type === "text") {
        const text = part.text ?? "";
        return text.trim() ? { key, kind: "text", text } : undefined;
      }
      if (part.type === "thinking") {
        ensureThinkingBlockCollapsed(key);
        return { key, kind: "thinking", text: part.thinking ?? "", redacted: Boolean(part.redacted) };
      }
      if (part.type === "toolCall") return { key, kind: "toolCall", name: part.name ?? "tool", args: part.arguments };
      return { key, kind: "text", text: `[unsupported content: ${part.type}]` };
    }).filter((block): block is ChatBlock => Boolean(block));
  }
  return [];
}

function ensureThinkingBlockCollapsed(key: string) {
  if (knownThinkingBlocks.has(key)) return;
  knownThinkingBlocks.add(key);
  collapsedThinkingBlocks.value.add(key);
}

function isThinkingCollapsed(key: string): boolean {
  return collapsedThinkingBlocks.value.has(key);
}

function toggleThinkingBlock(key: string) {
  const next = new Set(collapsedThinkingBlocks.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedThinkingBlocks.value = next;
}

function thinkingLabel(block: Extract<ChatBlock, { kind: "thinking" }>): string {
  if (block.redacted) return "Thinking redacted";
  return block.text.length > 0 ? `Thinking... ${block.text.length} chars` : "Thinking...";
}

function captureChatScrollIntent() {
  const element = chatMessages.value;
  if (!element) {
    shouldAutoScrollChat = true;
    return;
  }
  shouldAutoScrollChat = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
}

async function scrollChatIfNeeded() {
  if (!shouldAutoScrollChat) return;
  await nextTick();
  const element = chatMessages.value;
  if (element) element.scrollTop = element.scrollHeight;
}
</script>

<template>
  <main class="app">
    <section class="pane sidebar">
      <div class="workspaceHeader">
        <div>
          <h1>Workspace</h1>
          <p>/workspace</p>
        </div>
        <button class="iconButton" title="Refresh" @click="() => refreshFiles()">↻</button>
      </div>
      <div class="sidebarBody">
        <div class="fileTree">
          <template v-for="node in fileTree" :key="node.path">
            <TreeNode
              :node="node"
              :selected-path="selectedPath"
              :depth="0"
              @select="selectFile"
              @toggle="toggleDir"
            />
          </template>
        </div>
        <section class="editorPanel">
          <div class="editorHeader">
            <div>
              <h2>{{ selectedFileName }}</h2>
              <p>{{ selectedPath }}</p>
            </div>
          </div>
          <textarea v-model="selectedText" class="fileEditor" @input="updateFile" />
        </section>
      </div>
    </section>

    <section class="pane chat">
      <div class="chatHeader">
        <div class="agentTitle">
          <span class="statusDot" :class="{ running }"></span>
          <h1>Agent</h1>
          <p>{{ modelType }} · {{ modelName }}</p>
        </div>
        <button class="iconButton" title="Settings" @click="showSettings = true">⚙</button>
      </div>

      <div ref="chatMessages" class="chatMessages" @scroll="captureChatScrollIntent">
        <div
          v-for="item in chatItems"
          :key="item.id"
          class="bubble"
          :class="item.role"
        >
          <div class="role">{{ item.role }}</div>
          <div class="messageBlocks">
            <template v-for="block in item.blocks" :key="block.key">
              <pre v-if="block.kind === 'text'">{{ block.text }}</pre>
              <div v-else-if="block.kind === 'toolCall'" class="toolCallBlock">
                <div class="toolCallName">Calling {{ block.name }}</div>
                <pre>{{ JSON.stringify(block.args, null, 2) }}</pre>
              </div>
              <div v-else class="thinkingBlock" :class="{ redacted: block.redacted }">
                <button class="thinkingHeader" type="button" @click="toggleThinkingBlock(block.key)">
                  <span class="thinkingChevron" :class="{ collapsed: isThinkingCollapsed(block.key) }">⌄</span>
                  <span>{{ thinkingLabel(block) }}</span>
                </button>
                <pre v-if="!isThinkingCollapsed(block.key)" class="thinkingText">{{ block.redacted ? "Thinking content was redacted by the provider." : block.text }}</pre>
              </div>
            </template>
          </div>
        </div>
        <div v-if="chatItems.length === 0" class="emptyChat">
          No messages yet.
        </div>
      </div>

      <form class="composerPanel" @submit.prevent="runPrompt">
        <textarea
          v-model="prompt"
          class="composer"
          placeholder="Ask the agent to inspect or edit the workspace..."
          @keydown.meta.enter.prevent="runPrompt"
          @keydown.ctrl.enter.prevent="runPrompt"
        />
        <button class="sendButton" type="submit" :disabled="!session || !apiKey || running">
          {{ running ? "Running..." : "Send" }}
        </button>
      </form>
    </section>

    <div v-if="showSettings" class="settingsOverlay" @click.self="showSettings = false">
      <section class="settingsPanel" aria-label="Settings">
        <div class="settingsHeader">
          <h2>Settings</h2>
          <button class="iconButton" title="Close settings" @click="showSettings = false">×</button>
        </div>
        <label>
          API key
          <input v-model="apiKey" type="password" placeholder="optional for shell/VFS demo" />
        </label>
        <label>
          modelType
          <input v-model="modelType" placeholder="moonshotai" />
        </label>
        <label>
          modelName
          <input v-model="modelName" placeholder="kimi-k2.6" />
        </label>
        <label>
          modelApiUrl
          <input v-model="modelApiUrl" placeholder="/v1" />
        </label>
        <p v-if="settingsError" class="settingsError">{{ settingsError }}</p>
        <div class="actions">
          <button :disabled="running" @click="saveSettings">Save</button>
          <button @click="showSettings = false">Cancel</button>
        </div>
      </section>
    </div>
  </main>
</template>
