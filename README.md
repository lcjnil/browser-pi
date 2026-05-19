# browser-pi

`browser-pi` is a browser-first runtime for running Pi-style coding agents without a local filesystem or native process access.

It provides:

- an agent session API shaped like `pi-coding-agent`
- an in-memory browser VFS
- a browser shell adapter backed by `@browser-pi/js-shell`
- built-in coding tools such as `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls`
- a Vue demo app under `packages/demo`

## Install

`browser-pi` has not been published to npm yet. For now, clone this repository and build it locally:

```bash
git clone <repo-url>
cd browser-pi
pnpm install
pnpm build
```

## Basic Usage

```ts
import { createAgentSession, createMemoryVFS } from "browser-pi";
import { getModel } from "@earendil-works/pi-ai";

const vfs = createMemoryVFS({
  files: {
    "/workspace/README.md": "# Demo\n\nMARKER: update this file\n",
    "/workspace/src/index.ts": "console.log('hello')\n",
  },
});

const { session } = await createAgentSession({
  model: {
    ...getModel("moonshotai", "kimi-k2.6"),
    baseUrl: "/v1",
  },
  apiKey: "your-api-key",
  vfs,
  skills: [{
    name: "repo-editor",
    description: "Use when editing files in the browser workspace.",
    content: "Prefer bash for exploration. Use edit/write for intentional file changes.",
  }],
});

await session.prompt("Find MARKER entries and update README.md.");
```

## Runtime API

The main entry point is `createAgentSession(options)`.

Important options:

- `model`: a `@earendil-works/pi-ai` model
- `apiKey` or `getApiKey`: model authentication
- `vfs`: a `BrowserVFS`; defaults to an in-memory VFS
- `shell`: optional custom shell adapter; defaults to the js-shell adapter
- `tools`: active built-in tool names
- `customTools`: externally injected tools
- `skills`: externally injected skills
- `systemPrompt` / `appendSystemPrompt`: prompt customization

The returned `session` supports:

- `prompt(input)`
- `continue()`
- `abort()`
- `dispose()`
- `subscribe(listener)`
- `getMessages()`
- `getActiveToolNames()`
- `setActiveToolNames(names)`

## Shell Environment

`browser-pi` does not run a real Linux shell. The `bash` tool is backed by `@browser-pi/js-shell`, a pure TypeScript shell with a browser VFS.

This means agents can use implemented BusyBox/Agent-style applets such as:

- `cat`, `cd`, `cp`, `cut`, `echo`, `find`, `grep`, `head`, `ln`, `ls`
- `mkdir`, `mv`, `printf`, `pwd`, `readlink`, `rm`, `sed`, `sort`
- `tail`, `test`, `touch`, `tr`, `uniq`, `wc`, `xargs`

Use `busybox --list` or `help` inside the shell to list the currently registered commands.

Do not assume Node.js, Python, package managers, network access, tty, signals, or real OS processes exist in the shell.

## Demo

```bash
pnpm install
pnpm dev:demo
```

The demo is a separate workspace package in `packages/demo`. It loads a richer sample workspace into the browser VFS, including a snapshot of `packages/js-shell`.

Demo model API proxy:

- `packages/demo/.env` documents `OPENAI_API_URL=`
- `packages/demo/.env.local` can point local `/v1` traffic at your OpenAI-compatible endpoint, for example `OPENAI_API_URL=https://api.msh.team/v1`
- `.env.local` is ignored by git

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm build:demo
```

Root `pnpm build` compiles the `browser-pi` npm package into `dist/`. The demo build is intentionally separate.

## Packages

- `browser-pi`: browser agent runtime
- `@browser-pi/js-shell`: pure TypeScript shell and async in-memory VFS
- `@browser-pi/demo`: local demo app, not published
