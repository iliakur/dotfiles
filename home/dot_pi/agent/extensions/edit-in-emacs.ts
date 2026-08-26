import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

type ProcessResult = {
	ok: boolean;
	stdout: string;
	stderr: string;
};

type ResolveResult =
	| {
			kind: "path";
			path: string;
	  }
	| {
			kind: "cancelled";
	  }
	| {
			kind: "not_found";
	  };

type ParsedTarget = {
	rawTarget: string;
	line?: number;
	col?: number;
};

type EditArgs = {
	newFrame: boolean;
	wait: boolean;
	target: ParsedTarget;
};

type RecentState = {
	recentFiles: string[];
};

const STATE_TYPE = "edit-in-emacs-state";
const MAX_RECENT_FILES = 50;
const ALIASES = new Set(["this", "current", "last", "this file", "current file", "last file"]);

function parseTarget(raw: string): ParsedTarget | null {
	const value = raw.trim();
	if (!value) return null;
	const match = value.match(/^(.*?)(?::(\d+))?(?::(\d+))?$/);
	if (!match || !match[1]?.trim()) return null;
	return {
		rawTarget: match[1].trim(),
		line: match[2] ? Number(match[2]) : undefined,
		col: match[3] ? Number(match[3]) : undefined,
	};
}

function parseEditArgs(raw: string): EditArgs | null {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;
	let newFrame = true;
	let wait = false;
	const positional: string[] = [];
	for (const token of tokens) {
		if (token === "--no-frame" || token === "--nf") {
			newFrame = false;
			continue;
		}
		if (token === "--wait") {
			wait = true;
			continue;
		}
		positional.push(token);
	}
	if (positional.length === 0) return null;
	const target = parseTarget(positional.join(" "));
	if (!target) return null;
	return { newFrame, wait, target };
}

function run(cmd: string, args: string[], cwd: string): Promise<ProcessResult> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (error) => {
			resolve({ ok: false, stdout: "", stderr: error.message });
		});
		child.on("close", (code) => {
			resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() });
		});
	});
}

function runShell(script: string, args: string[], cwd: string): Promise<ProcessResult> {
	return run("bash", ["-lc", script, "--", ...args], cwd);
}

async function expandPathInShell(cwd: string, rawTarget: string): Promise<string | null> {
	const script = [
		"target=\"$1\"",
		"if [[ \"$target\" == \"~\" ]]; then",
		"  target=\"$HOME\"",
		"elif [[ \"$target\" == \"~/\"* ]]; then",
		"  target=\"$HOME/${target:2}\"",
		"fi",
		"if [[ \"$target\" != /* ]]; then target=\"$PWD/$target\"; fi",
		"printf '%s' \"$target\"",
	].join("\n");
	const result = await runShell(script, [rawTarget], cwd);
	if (!result.ok || !result.stdout) return null;
	return result.stdout;
}

async function resolveLiteralPath(cwd: string, rawTarget: string): Promise<string | null> {
	const expanded = await expandPathInShell(cwd, rawTarget);
	if (!expanded) return null;
	if (!(await fileExists(expanded))) return null;
	return expanded;
}

async function fileExists(candidatePath: string): Promise<boolean> {
	try {
		await access(candidatePath);
		return true;
	} catch {
		return false;
	}
}

async function resolveProseTargetPath(cwd: string, rawTarget: string, recentFiles: string[]): Promise<ResolveResult> {
	const trimmed = rawTarget.trim();
	if (!trimmed) return { kind: "not_found" };
	const alias = trimmed.toLowerCase();
	if (ALIASES.has(alias)) {
		for (const candidate of recentFiles) {
			const abs = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
			if (await fileExists(abs)) return { kind: "path", path: abs };
		}
		return { kind: "not_found" };
	}
	const repoFiles = await listRepoFiles(cwd);
	const reviewFiles = await listReviewFiles(cwd);
	const candidates = Array.from(
		new Set([
			...recentFiles.map((filePath) => (path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath))),
			...repoFiles.map((filePath) => path.resolve(cwd, filePath)),
			...reviewFiles,
		]),
	).slice(0, 400);
	if (candidates.length === 0) return { kind: "not_found" };
	const selected = await resolveWithLlm(cwd, trimmed, candidates);
	if (!selected) return { kind: "not_found" };
	return { kind: "path", path: selected };
}

async function listRepoFiles(cwd: string): Promise<string[]> {
	const git = await run("git", ["ls-files", "--cached", "--others", "--exclude-standard"], cwd);
	if (git.ok && git.stdout) {
		return Array.from(new Set(git.stdout.split("\n").map((line) => line.trim()).filter(Boolean)));
	}
	const rg = await run("rg", ["--files", "--hidden", "-g", "!.git"], cwd);
	if (rg.ok && rg.stdout) {
		return Array.from(new Set(rg.stdout.split("\n").map((line) => line.trim()).filter(Boolean)));
	}
	return [];
}

async function listReviewFiles(cwd: string): Promise<string[]> {
	const result = await runShell(
		"if [ -d \"$HOME/Documents/reviews\" ]; then find \"$HOME/Documents/reviews\" -type f 2>/dev/null; fi",
		[],
		cwd,
	);
	if (!result.ok || !result.stdout) return [];
	return Array.from(new Set(result.stdout.split("\n").map((line) => line.trim()).filter(Boolean)));
}

async function resolveWithLlm(cwd: string, query: string, candidates: string[]): Promise<string | null> {
	const options = candidates.map((candidate, idx) => `${idx + 1}. ${candidate}`).join("\n");
	const prompt = [
		"Resolve a file description to exactly one path from the candidate list.",
		`CWD: ${cwd}`,
		`Query: ${query}`,
		"Candidates:",
		options,
		"",
		"Reply with exactly one line:",
		"- the full selected path copied exactly from the candidates, or",
		"- NONE",
	].join("\n");
	const result = await run("pi", ["-p", "--no-session", prompt], cwd);
	if (!result.ok || !result.stdout) return null;
	const lines = result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (line === "NONE") return null;
		if (candidates.includes(line) && (await fileExists(line))) return line;
	}
	return null;
}

function extractPathFromToolInput(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const value = (input as { path?: unknown }).path;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecentState(entries: SessionEntry[]): RecentState {
	let recentFiles: string[] = [];
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== STATE_TYPE) continue;
		const data = entry.data as { recentFiles?: unknown } | undefined;
		if (!data || !Array.isArray(data.recentFiles)) continue;
		recentFiles = data.recentFiles.filter((item): item is string => typeof item === "string");
	}
	return { recentFiles };
}

function updateRecentFiles(recentFiles: string[], nextPath: string): string[] {
	const normalized = nextPath.trim();
	if (!normalized) return recentFiles;
	const deduped = [normalized, ...recentFiles.filter((p) => p !== normalized)];
	return deduped.slice(0, MAX_RECENT_FILES);
}


function buildEmacsClientArgs(absPath: string, args: EditArgs): string[] {
	const out: string[] = [];
	if (args.newFrame) out.push("-c");
	if (!args.wait) out.push("-n");
	if (args.target.line) {
		out.push(`+${args.target.line}${args.target.col ? `:${args.target.col}` : ""}`);
	}
	out.push(absPath);
	return out;
}

async function openInEmacs(cwd: string, absPath: string, args: EditArgs): Promise<{ ok: boolean; message: string }> {
	const clientArgs = buildEmacsClientArgs(absPath, args);
	const clientScript = `exec emacsclient "$@"`;
	const firstTry = await runShell(clientScript, clientArgs, cwd);
	if (firstTry.ok) return { ok: true, message: `Opened ${absPath}` };
	const daemonStart = await runShell("exec emacs --daemon", [], cwd);
	if (!daemonStart.ok) {
		const error = daemonStart.stderr || firstTry.stderr || "unknown error";
		return { ok: false, message: `Failed to start Emacs daemon: ${error}` };
	}
	const secondTry = await runShell(clientScript, clientArgs, cwd);
	if (secondTry.ok) return { ok: true, message: `Opened ${absPath}` };
	return { ok: false, message: `Failed to open ${absPath}: ${secondTry.stderr || "unknown error"}` };
}

export default function (pi: ExtensionAPI) {
	let recentFiles: string[] = [];

	pi.on("session_start", async (_event, ctx) => {
		recentFiles = readRecentState(ctx.sessionManager.getEntries()).recentFiles;
	});

	pi.on("tool_call", async (event) => {
		if (!["read", "edit", "write"].includes(event.toolName)) return;
		const candidate = extractPathFromToolInput(event.input);
		if (!candidate) return;
		recentFiles = updateRecentFiles(recentFiles, candidate);
		pi.appendEntry(STATE_TYPE, { recentFiles });
	});

	pi.registerCommand("edit", {
		description: "Open a file in Emacs. Usage: /edit [--nf|--no-frame] [--wait] <path or description>[:line[:col]]",
		handler: async (rawArgs, ctx) => {
			const parsed = parseEditArgs(rawArgs || "");
			if (!parsed) {
				ctx.ui.notify("Usage: /edit [--nf|--no-frame] [--wait] <path or description>[:line[:col]]", "warning");
				return;
			}
			let resolvedPath = await resolveLiteralPath(ctx.cwd, parsed.target.rawTarget);
			if (!resolvedPath) {
				const prose = await resolveProseTargetPath(ctx.cwd, parsed.target.rawTarget, recentFiles);
				if (prose.kind === "cancelled") {
					ctx.ui.notify("Edit cancelled", "info");
					return;
				}
				if (prose.kind === "not_found") {
					ctx.ui.notify(`Could not resolve target: ${parsed.target.rawTarget}`, "error");
					return;
				}
				resolvedPath = prose.path;
			}
			recentFiles = updateRecentFiles(recentFiles, resolvedPath);
			pi.appendEntry(STATE_TYPE, { recentFiles });
			const result = await openInEmacs(ctx.cwd, resolvedPath, parsed);
			ctx.ui.notify(result.message, result.ok ? "info" : "error");
		},
	});
}
