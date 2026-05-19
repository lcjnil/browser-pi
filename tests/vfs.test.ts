import { describe, expect, it } from "vitest";
import { createMemoryVFS } from "../src/runtime";

describe("memory VFS", () => {
  it("reads, writes, lists, removes, and snapshots files", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/README.md": "hello\n",
      },
    });

    await vfs.writeText("src/index.ts", "console.log('ok')\n");
    await vfs.appendFile("/workspace/README.md", "world\n");

    expect(await vfs.readText("/workspace/README.md")).toBe("hello\nworld\n");
    expect((await vfs.listDir("/workspace")).map((entry) => entry.name)).toEqual(["src", "README.md"]);

    const snapshot = await vfs.exportSnapshot();
    const restored = createMemoryVFS();
    await restored.importSnapshot(snapshot);
    expect(await restored.readText("/workspace/src/index.ts")).toBe("console.log('ok')\n");

    await restored.remove("/workspace/src", { recursive: true });
    expect(await restored.exists("/workspace/src/index.ts")).toBe(false);
  });
});
