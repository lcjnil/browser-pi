const jsShellFiles = import.meta.glob<string>("../../js-shell/**/*.{json,ts}", {
  eager: true,
  import: "default",
  query: "?raw",
});

export function createDemoFiles(): Record<string, string> {
  return {
    ...createWorkspaceScaffold(),
    ...createJsShellProjectFiles(),
  };
}

function createWorkspaceScaffold(): Record<string, string> {
  return {
    "/workspace/README.md": `# Browser Agent Workspace

This demo workspace contains a real snapshot of the local js-shell package.

Suggested tasks:

- Find MARKER entries and update docs.
- Inspect command implementations under packages/js-shell/src/commands.
- Run grep, find, wc, sed, and xargs through the browser shell.
- Add a small test for a command and explain the expected behavior.
`,
    "/workspace/package.json": JSON.stringify({
      name: "browser-agent-demo-workspace",
      private: true,
      type: "module",
      scripts: {
        test: "vitest run",
        "shell:smoke": "sh scripts/smoke.sh",
      },
      dependencies: {
        "@browser-pi/js-shell": "workspace:*",
      },
    }, null, 2) + "\n",
    "/workspace/tasks/PLAN.md": `# Task Plan

- MARKER: Review packages/js-shell/src/commands/find.ts for edge cases.
- MARKER: Add a regression note for shell redirection behavior.
- MARKER: Summarize which BusyBox tests are intentionally skipped.
`,
    "/workspace/scripts/smoke.sh": `#!/bin/sh
set -eu

echo "Files in js-shell package:"
find packages/js-shell -type f | sort | head -20

echo
echo "MARKER entries:"
grep -R MARKER . | head -20
`,
    "/workspace/apps/demo-cli/src/main.ts": `import { createJsShell, createMemoryVFS } from "@browser-pi/js-shell";

const vfs = createMemoryVFS({
  files: {
    "/workspace/input.txt": "alpha\\nMARKER beta\\n",
  },
});

const shell = createJsShell({ vfs });
const result = await shell.exec("grep -R MARKER .", { cwd: "/workspace" });
console.log(result.stdout);
`,
    "/workspace/docs/agent-notes.md": `# Agent Notes

The runtime should behave like a local coding agent, but all file reads,
writes, and shell commands run inside the browser VFS.

Important constraints:

- No Node fs access at runtime.
- Shell commands must write through to the same VFS that the editor reads.
- The demo API key is stored locally for convenience.
`,
  };
}

function createJsShellProjectFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(jsShellFiles)) {
    const relative = path.replace("../../js-shell/", "");
    files[`/workspace/packages/js-shell/${relative}`] = content;
  }
  return files;
}
