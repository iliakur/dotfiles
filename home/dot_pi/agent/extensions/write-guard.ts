/**
 * Write Guard Extension
 *
 * Blocks all file writes and deletions except within an explicit allowlist of directories.
 * Covers the `write` and `edit` tools (path-based check) and the `bash` tool
 * (pattern-based heuristic for rm / redirect operations).
 *
 * Edit ALLOWED_DIRS to suit your needs. Paths are resolved relative to the
 * working directory when they are not absolute.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";

const ALLOWED_DIRS: string[] = [
  "/Users/ilia.kurenkov/Documents",
  "/Users/ilia.kurenkov/Documents/rfcs",
  "/Users/ilia.kurenkov/src",
  "/Users/ilia.kurenkov/dd",
  "/Users/ilia.kurenkov/.pi",
];

// Heuristic patterns that suggest a bash command writes or deletes files.
const WRITE_DELETE_PATTERNS = [
  /\brm\s/,          // rm (delete)
  /\brmdir\b/,       // rmdir
  /\bunlink\b/,      // unlink
  /\bmv\s/,          // mv (source file is deleted)
  /(?<![<>])>(?!>?)/, // > or >> redirects (output redirection)
  /\btee\s/,         // tee (writes to a file)
  /\btruncate\b/,    // truncate
  /\bdd\s/,          // dd
];

let hasBlockedWriteOutsideAllowedDirs = false;

function expandAndCanonicalizePath(inputPath: string, cwd: string): string {
  let expanded = inputPath;
  if (expanded === "~" || expanded.startsWith("~/")) {
    expanded = nodePath.join(nodeOs.homedir(), expanded.slice(2));
  }

  const absolute = nodePath.resolve(cwd, expanded);
  try {
    return nodeFs.realpathSync.native(absolute);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      const parent = nodePath.dirname(absolute);
      try {
        const realParent = nodeFs.realpathSync.native(parent);
        return nodePath.join(realParent, nodePath.basename(absolute));
      } catch {
        return absolute;
      }
    }
    return absolute;
  }
}

function isAllowed(targetPath: string, cwd: string): boolean {
  if (ALLOWED_DIRS.length === 0) return false;
  const resolved = expandAndCanonicalizePath(targetPath, cwd);
  return ALLOWED_DIRS.some((dir) => {
    const allowed = expandAndCanonicalizePath(dir, cwd);
    return resolved === allowed || resolved.startsWith(allowed + nodePath.sep);
  });
}

function looksLikeWriteOrDelete(command: string): boolean {
  return WRITE_DELETE_PATTERNS.some((re) => re.test(command));
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const cwd = ctx.cwd;

    if (event.toolName === "write" || event.toolName === "edit") {
      const path = event.input.path as string;
      if (!isAllowed(path, cwd)) {
        if (!hasBlockedWriteOutsideAllowedDirs) {
          hasBlockedWriteOutsideAllowedDirs = true;
          const msg = `Blocked: "${path}" is outside the allowed directories.`;
          if (ctx.hasUI) ctx.ui.notify(`${msg} Retry to confirm.`, "warning");
          return { block: true, reason: msg };
        }

        if (!ctx.hasUI) {
          return { block: true, reason: `Blocked: "${path}" is outside the allowed directories.` };
        }

        const ok = await ctx.ui.confirm(
          "Write outside allowed directories",
          `Path: ${path}\n\nThis path is outside ALLOWED_DIRS. Allow this write?`,
        );

        if (!ok) {
          return { block: true, reason: `Blocked: "${path}" is outside the allowed directories.` };
        }
      }
      return undefined;
    }

    if (event.toolName === "bash") {
      const command = event.input.command as string;
      if (!looksLikeWriteOrDelete(command)) return undefined;

      // The command looks destructive but we cannot reliably extract paths from
      // arbitrary shell syntax, so ask the user before allowing it.
      if (!ctx.hasUI) {
        return { block: true, reason: "Bash write/delete blocked in non-interactive mode." };
      }

      const ok = await ctx.ui.confirm(
        "Potentially destructive bash command",
        `The command may write or delete files outside the allowed directories:\n\n${command}\n\nAllow it?`,
      );

      if (!ok) {
        return { block: true, reason: "Bash write/delete blocked by user." };
      }
      return undefined;
    }

    return undefined;
  });
}
