export function normalizePath(path: string, cwd = "/workspace"): string {
  const input = path.trim() || ".";
  const rawParts = (input.startsWith("/") ? input : `${cwd}/${input}`).split("/");
  const parts: string[] = [];

  for (const part of rawParts) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }

  return `/${parts.join("/")}` || "/";
}

export function dirname(path: string): string {
  const normalized = normalizePath(path, "/");
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

export function basename(path: string): string {
  const normalized = normalizePath(path, "/");
  if (normalized === "/") return "/";
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.join("/"), "/");
}

export function relativePath(from: string, to: string): string {
  const fromParts = normalizePath(from, "/").split("/").filter(Boolean);
  const toParts = normalizePath(to, "/").split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/") || ".";
}
