import { describe, expect, it } from "vitest";
import { createJsShellAdapter, createMemoryVFS } from "../src/runtime";
import { createBuiltInTools } from "../src/runtime/tools";

describe("built-in tools", () => {
  it("reads, writes, edits, and runs bash", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/README.md": "alpha\nbeta\n",
      },
    });
    const shell = createJsShellAdapter({ vfs });
    const tools = createBuiltInTools({ vfs, shell, cwd: "/workspace" });

    await tools.write.execute("1", { path: "new.txt", content: "hello\n" });
    expect(await vfs.readText("/workspace/new.txt")).toBe("hello\n");

    await tools.edit.execute("2", { path: "README.md", oldText: "beta", newText: "gamma" });
    expect(await vfs.readText("/workspace/README.md")).toContain("gamma");

    const read = await tools.read.execute("3", { path: "README.md", offset: 1, limit: 1 });
    expect(read.content[0]?.type === "text" ? read.content[0].text : "").toBe("alpha");

    const bash = await tools.bash.execute("4", { command: "grep -R gamma ." });
    expect(bash.content[0]?.type === "text" ? bash.content[0].text : "").toContain("gamma");
  });

  it("fails edit when oldText is missing", async () => {
    const vfs = createMemoryVFS({ files: { "/workspace/a.txt": "hello\n" } });
    const shell = createJsShellAdapter({ vfs });
    const tools = createBuiltInTools({ vfs, shell, cwd: "/workspace" });

    await expect(tools.edit.execute("1", { path: "a.txt", oldText: "missing", newText: "x" })).rejects.toThrow("oldText not found");
  });
});
