# @browser-pi/js-shell

`@browser-pi/js-shell` is a pure TypeScript shell for browser-based coding agents.

It provides:

- an async in-memory VFS
- a shell interpreter with pipelines, redirects, command substitution, variables, and common control-flow support
- BusyBox/Agent-style applets implemented in TypeScript
- no WASM, Node filesystem, real processes, tty, or OS-level permissions

## Install

```bash
pnpm add @browser-pi/js-shell
```

## Basic Usage

```ts
import { createJsShell, createMemoryVFS } from "@browser-pi/js-shell";

const vfs = createMemoryVFS({
  files: {
    "/workspace/README.md": "# Demo\n\nMARKER: update this file\n",
    "/workspace/src/index.ts": "console.log('hello')\n",
  },
});

const shell = createJsShell({ vfs, cwd: "/workspace" });

const result = await shell.exec("grep -R MARKER . | head -20", {
  cwd: "/workspace",
});

console.log(result.stdout);
```

## Public API

```ts
createMemoryVFS(options?): AsyncVFS
createJsShell(options?): JsShell
```

`AsyncVFS` supports:

- `readFile`, `writeFile`, `appendFile`
- `readText`, `writeText`
- `listDir`, `stat`, `exists`
- `mkdir`, `remove`
- `symlink`, `readlink`
- `exportSnapshot`, `importSnapshot`

`JsShell` supports:

- `exec(script, options)`
- `registerCommand(name, command)`
- `vfs`

## Built-in Commands

Current applets include:

- `cat`, `cd`, `chmod`, `cmp`, `cp`, `cut`, `dirname`, `echo`, `env`
- `false`, `find`, `grep`, `head`, `ln`, `ls`, `mkdir`, `mv`
- `printf`, `pwd`, `read`, `readlink`, `rm`, `sed`, `sort`
- `tail`, `test` / `[`, `touch`, `tr`, `true`, `uniq`, `wc`, `xargs`

Run `help` or `busybox --list` to print the registered command list.

The package also registers a `busybox` dispatcher, so both of these work:

```sh
grep -R MARKER .
busybox grep -R MARKER .
```

## Compatibility

The test suite is aligned with BusyBox 1.37.0 where browser/VFS semantics make sense.

Supported areas include:

- common file and directory operations
- recursive grep/find workflows
- text processing with sed, sort, uniq, tr, cut, wc, xargs
- shell pipelines and redirects
- symlink behavior in the in-memory VFS

Known non-goals:

- real fork/exec
- job control
- tty behavior
- OS signals
- real permission enforcement
- complete BusyBox applet coverage

## Development

From the repository root:

```bash
pnpm test -- packages/js-shell
pnpm typecheck
```

The compatibility notes for migrated BusyBox tests live in `src/commands/BUSYBOX_TESTS.md`.
