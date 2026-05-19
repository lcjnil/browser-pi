import type { ShellCommand } from "../types";
import { cat } from "./cat";
import { cd } from "./cd";
import { chmod } from "./chmod";
import { cmp } from "./cmp";
import { cp } from "./cp";
import { cut } from "./cut";
import { dirnameCommand } from "./dirname";
import { echo } from "./echo";
import { env } from "./env";
import { find } from "./find";
import { grep } from "./grep";
import { head } from "./head";
import { ln } from "./ln";
import { ls } from "./ls";
import { mkdir } from "./mkdir";
import { mv } from "./mv";
import { printf } from "./printf";
import { pwd } from "./pwd";
import { read } from "./read";
import { readlink } from "./readlink";
import { rm } from "./rm";
import { sed } from "./sed";
import { setCommand, exportCommand, returnCommand, unsetCommand } from "./shell-builtins";
import { sort } from "./sort";
import { tail } from "./tail";
import { testCommand } from "./test";
import { touch } from "./touch";
import { tr } from "./tr";
import { uniq } from "./uniq";
import { wc } from "./wc";
import { xargs } from "./xargs";

export function createDefaultCommands(): Record<string, ShellCommand> {
  const commands: Record<string, ShellCommand> = {
    "[": testCommand,
    cat,
    cd,
    chmod,
    cmp,
    cp,
    cut,
    dirname: dirnameCommand,
    echo,
    env,
    false: () => ({ exitCode: 1, stdout: "", stderr: "" }),
    find,
    grep,
    head,
    help: () => ({ exitCode: 0, stdout: formatCommandList(commands), stderr: "" }),
    ln,
    ls,
    mkdir,
    mv,
    printf,
    pwd,
    read,
    readlink,
    rm,
    sed,
    sort,
    tail,
    test: testCommand,
    touch,
    tr,
    true: () => ({ exitCode: 0, stdout: "", stderr: "" }),
    uniq,
    wc,
    xargs,
    export: exportCommand,
    readonly: exportCommand,
    local: exportCommand,
    unset: unsetCommand,
    set: setCommand,
    return: returnCommand,
    break: () => ({ exitCode: 0, stdout: "", stderr: "" }),
    continue: () => ({ exitCode: 0, stdout: "", stderr: "" }),
  };
  commands.busybox = async (ctx) => {
    const [name, ...args] = ctx.args;
    if (name === "--list") return { exitCode: 0, stdout: formatCommandList(commands), stderr: "" };
    if (name === "--help" || name === undefined) {
      return {
        exitCode: 0,
        stdout: [
          "BusyBox v1.37.0-js-shell multi-call binary.",
          "Usage: busybox [function [arguments]...]",
          "",
          "Currently defined functions:",
          formatCommandList(commands).trimEnd(),
        ].join("\n") + "\n",
        stderr: "",
      };
    }
    const command = commands[name];
    if (!command) return { exitCode: 127, stdout: "", stderr: `${name}: applet not found\n` };
    return command({ ...ctx, args });
  };
  commands["!"] = async (ctx) => {
    const result = await ctx.shell.exec(ctx.args.join(" "), { cwd: ctx.cwd, env: ctx.env, stdin: ctx.stdin });
    return { exitCode: result.exitCode === 0 ? 1 : 0, stdout: result.stdout, stderr: result.stderr };
  };
  return commands;
}

function formatCommandList(commands: Record<string, ShellCommand>): string {
  return Object.keys(commands)
    .filter((name) => name !== "!" && name !== "busybox")
    .sort()
    .join("\n") + "\n";
}
