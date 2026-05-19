import { describe, expect, it } from "vitest";
import { createMemoryVFS } from "../src";

describe("js-shell memory VFS", () => {
  it("supports async file operations, symlinks, and snapshots", async () => {
    const vfs = createMemoryVFS({
      files: {
        "/workspace/src/index.ts": "console.log('hello')\n",
      },
    });

    await vfs.appendFile("src/index.ts", "console.log('again')\n");
    await vfs.mkdir("tmp/nested", { recursive: true });
    await vfs.writeText("tmp/nested/marker.txt", "MARKER\n");
    await vfs.symlink("tmp/nested/marker.txt", "marker-link");

    expect(await vfs.readText("marker-link")).toBe("MARKER\n");
    expect((await vfs.listDir("/workspace")).map((entry) => entry.name)).toEqual([
      "src",
      "tmp",
      "marker-link",
    ]);

    const snapshot = await vfs.exportSnapshot();
    const next = createMemoryVFS();
    await next.importSnapshot(snapshot);

    expect(await next.readText("/workspace/src/index.ts")).toContain("again");
    expect(await next.readlink("/workspace/marker-link")).toBe("tmp/nested/marker.txt");
  });
});
