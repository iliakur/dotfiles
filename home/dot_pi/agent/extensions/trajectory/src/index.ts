/**
 * Trajectory Capture Extension for Pi
 *
 * Subscribes to Pi lifecycle events and forwards them through trajectory's
 * receipt-backed capture-hook helper. Capture runs through bounded background queues so Pi
 * callbacks never wait on trajectory being slow or unavailable.
 *
 * Install: copy to ~/.pi/agent/extensions/trajectory/
 * Or symlink: ln -s /path/to/plugin/trajectory-pi ~/.pi/agent/extensions/trajectory
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BoundedSerialQueue } from "./async-queue.ts";
import { aggregatePiAgentRun, PiAgentRunTracker, summarizePiAgentRunRequests } from "./agent-run.ts";
import { buildTrajectorySchema, runTrajectoryQuery } from "./query-tools.ts";
import { piSessionIdentityFields, readPiSessionHeaderId } from "./session-identity.ts";
import { listInstalledExtensions } from "./extension-inventory.ts";
import { ensureTrajectoryServe as requestTrajectoryServe } from "./serve-ensure.ts";

const DEFAULT_PORT = 19222;
const POST_TIMEOUT_MS = 500;
const CAPTURE_HELPER_TIMEOUT_MS = 1500;
const CAPTURE_QUEUE_CAPACITY = 256;
// Pi awaits session_shutdown callbacks before exiting. Give an already-idle
// queue one brief chance to finish, then hand the remaining ordered work to a
// detached batch worker instead of waiting for capture-helper timeouts.
const SHUTDOWN_DRAIN_MS = 100;
const CAPTURE_BATCH_HANDOFF_TIMEOUT_MS = 100;
const INCOGNITO_FALLBACK_TIMEOUT_MS = 5000;
const MAX_TRAJECTORY_HOME_POINTER_BYTES = 4096;
const PI_EXTENSION_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PI_TRAJECTORY_HOME_POINTER = "trajectory-home";
const PLUGIN_PROVENANCE = {
	plugin: {
		id: "trajectory-pi",
		version: "3.2.8",
		source_scope: "trajectory_plugin",
	},
};
export interface TrajectoryExtensionRuntime {
	captureQueue?: BoundedSerialQueue;
	captureHook?: (eventType: string, body: Record<string, unknown>, deliveryId: string) => Promise<void>;
	captureHookBatch?: (captures: CaptureHookBatchItem[]) => Promise<void>;
	ensureServe?: () => Promise<boolean>;
	shutdownDrainMs?: number;
}

export interface CaptureHookBatchItem {
	event_type: string;
	body: Record<string, unknown>;
	delivery_id: string;
}

export function resolvePiTrajectoryHome(
	extensionRoot = PI_EXTENSION_ROOT,
	environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
	const configured = environment.TRAJECTORY_HOME?.trim();
	if (configured) return resolve(configured);

	const pointer = join(extensionRoot, PI_TRAJECTORY_HOME_POINTER);
	try {
		const info = lstatSync(pointer);
		if (info.isFile() && info.size > 0 && info.size <= MAX_TRAJECTORY_HOME_POINTER_BYTES) {
			const installed = readFileSync(pointer, "utf8").trim();
			if (installed && !installed.includes("\n") && !installed.includes("\r") && isAbsolute(installed)) return installed;
		}
	} catch {
		// Manual plugin installs have no setup-owned home pointer.
	}

	const userHome = environment.HOME?.trim();
	return userHome ? join(userHome, ".trajectory") : undefined;
}

export function piTrajectoryChildEnvironment(
	extensionRoot = PI_EXTENSION_ROOT,
	environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const home = resolvePiTrajectoryHome(extensionRoot, environment);
	return childEnvironmentForHome(home, environment);
}

function childEnvironmentForHome(
	home: string | undefined,
	environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	return home ? { ...environment, TRAJECTORY_HOME: home } : { ...environment };
}

function mergePluginProvenance(provenance: Record<string, unknown>): Record<string, unknown> {
	const plugin = provenance.plugin;
	if (plugin && typeof plugin === "object" && !Array.isArray(plugin)) {
		const pluginRecord = plugin as Record<string, unknown>;
		if (typeof pluginRecord.id === "string" && pluginRecord.id !== "" && pluginRecord.id !== PLUGIN_PROVENANCE.plugin.id) {
			return pluginRecord;
		}
		return {
			...PLUGIN_PROVENANCE.plugin,
			...pluginRecord,
		};
	}
	return {
		...PLUGIN_PROVENANCE.plugin,
	};
}

function withPluginProvenance(body: Record<string, unknown>): Record<string, unknown> {
	const provenance = (body.provenance ?? {}) as Record<string, unknown>;
	return {
		...body,
		provenance: {
			...PLUGIN_PROVENANCE,
			...provenance,
			plugin: mergePluginProvenance(provenance),
		},
	};
}

export function registerTrajectoryExtension(pi: ExtensionAPI, runtime: TrajectoryExtensionRuntime = {}) {
	const port = parseInt(process.env.TRAJECTORY_PORT ?? String(DEFAULT_PORT), 10);
	const baseUrl = `http://127.0.0.1:${port}`;
	const captureQueue = runtime.captureQueue ?? new BoundedSerialQueue(CAPTURE_QUEUE_CAPACITY);
	const pendingCaptures = new Set<CaptureHookBatchItem>();

	let sessionId = "";
	const agentRuns = new PiAgentRunTracker();
	let unsettledMessages: unknown[] = [];

	// ── Receipt-backed binary delivery ───────────────────────────────

	function findTrajectoryBinary(trajectoryHome = resolvePiTrajectoryHome()): string | undefined {
		const candidates = [
			process.env.TRAJECTORY_BINARY?.trim(),
			trajectoryHome ? join(trajectoryHome, "bin", "trajectory") : undefined,
			join(PI_EXTENSION_ROOT, "bin", "trajectory"),
			process.env.HOME?.trim() ? join(process.env.HOME, "bin", "trajectory") : undefined,
		];
		for (const p of candidates) {
			if (p && existsSync(p)) return p;
		}
		// Let execFile search PATH as the final compatibility fallback.
		return "trajectory";
	}

	async function ensureTrajectoryServe(): Promise<boolean> {
		const home = resolvePiTrajectoryHome();
		const binPath = findTrajectoryBinary(home);
		if (!binPath) return false;
		const result = await requestTrajectoryServe({
			binary: binPath,
			client: "pi",
			port,
			env: childEnvironmentForHome(home),
		});
		if (!result.ok) {
			throw new Error(`Trajectory serve is not ready: ${result.diagnostic}`);
		}
		return result.ok;
	}

	async function enableIncognitoWithLocalFallback(cause: unknown, signal?: AbortSignal) {
		if (signal?.aborted) throw cause;
		const home = resolvePiTrajectoryHome();
		if (!home) {
			throw new Error("local incognito fallback cannot resolve the Trajectory home", { cause });
		}
		const stateDir = join(home, "state");
		const sentinel = join(stateDir, `incognito-${sessionId}`);
		await mkdir(stateDir, { recursive: true, mode: 0o700 });
		const stateInfo = await lstat(stateDir);
		if (!stateInfo.isDirectory() || stateInfo.isSymbolicLink()) {
			throw new Error("local incognito fallback found an unsafe state directory", { cause });
		}
		const temporary = join(stateDir, `.incognito-${sessionId}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
		let handle: Awaited<ReturnType<typeof open>> | undefined;
		try {
			handle = await open(temporary, "wx", 0o600);
			await handle.writeFile(`${sessionId}\n`, "utf8");
			await handle.sync();
			await handle.close();
			handle = undefined;
			await rename(temporary, sentinel);
		} finally {
			await handle?.close().catch(() => undefined);
			await rm(temporary, { force: true }).catch(() => undefined);
		}
		const sentinelInfo = await lstat(sentinel);
		if (!sentinelInfo.isFile() || sentinelInfo.isSymbolicLink()) {
			throw new Error("local incognito fallback could not verify the privacy sentinel", { cause });
		}
		const causeDetail = cause instanceof Error ? cause.message : String(cause);
		return {
			content: [{
				type: "text" as const,
				text: `Incognito enabled for session ${sessionId} via local privacy sentinel; content publish to non-exempt Datadog destinations is suppressed, while local JSONL capture and redacted accounting/activity metrics continue. Trajectory serve control was unavailable (${causeDetail}).`,
			}],
			details: { fallback: "local_sentinel" },
		};
	}

	async function setPersistentIncognitoWithLocalFallback(enable: boolean, cause: unknown, signal?: AbortSignal) {
		if (signal?.aborted) throw cause;
		const home = resolvePiTrajectoryHome();
		const binary = findTrajectoryBinary(home);
		if (!home || !binary) {
			throw new Error("persistent incognito fallback cannot resolve the Trajectory installation", { cause });
		}
		const action = enable ? "opt-out" : "opt-in";
		const output = await new Promise<string>((done, reject) => {
			execFile(binary, ["config", "publish", action, "--json"], {
				timeout: INCOGNITO_FALLBACK_TIMEOUT_MS,
				killSignal: "SIGKILL",
				maxBuffer: 64 * 1024,
				signal,
				env: childEnvironmentForHome(home),
			}, (error, stdout, stderr) => {
				if (error) {
					reject(new Error(stderr.trim() || error.message, { cause: error }));
					return;
				}
				done(stdout.trim());
			});
		});
		const state = JSON.parse(output) as { opted_out?: unknown };
		if (state.opted_out !== enable) {
			throw new Error("persistent incognito fallback returned an unexpected state", { cause });
		}
		return {
			content: [{
				type: "text" as const,
				text: `Persistent incognito ${enable ? "enabled" : "disabled"} for this user through the local Trajectory binary.`,
			}],
			details: { fallback: "local_binary", persistent: true },
		};
	}

	const ensureServeTask = runtime.ensureServe ?? ensureTrajectoryServe;

	// ── Tool registration ────────────────────────────────────────────

	pi.registerTool({
		name: "trajectory_status",
		label: "Trajectory Status",
		description: "Shows the current trajectory capture status including active sessions and event counts",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal) {
			try {
				const res = await fetch(`${baseUrl}/health`, {
					signal: signal ?? AbortSignal.timeout(POST_TIMEOUT_MS),
				});
				const data = await res.json();
				return {
					content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
					details: {},
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Trajectory serve unreachable: ${err}` }],
					details: {},
					isError: true,
				};
			}
		},
	});

	pi.registerTool({
		name: "trajectory_flush",
		label: "Trajectory Flush",
		description: "Flushes any pending trajectory data to ensure all events are written",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal) {
			try {
				await fetch(`${baseUrl}/flush`, {
					method: "POST",
					signal: signal ?? AbortSignal.timeout(5000),
				});
				return {
					content: [{ type: "text", text: "Trajectory data flushed." }],
					details: {},
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Flush failed: ${err}` }],
					details: {},
					isError: true,
				};
			}
		},
	});

	pi.registerTool({
		name: "trajectory_incognito",
		label: "Trajectory Incognito",
		description: "Toggles incognito for the current Pi session or persists the preference for this user. Local JSONL capture and accounting/activity metrics continue; content publish to non-exempt Datadog destinations is suppressed, and metrics omit explicit model and repository identity by default.",
		parameters: Type.Object({
			enable: Type.Boolean({ description: "true to enable incognito, false to disable it" }),
			persistent: Type.Optional(Type.Boolean({ description: "Apply the preference to all current and future sessions for this user" })),
			client: Type.Optional(Type.String({ description: "Optional compatibility hint; Pi uses its active native session" })),
			project_dir: Type.Optional(Type.String({ description: "Optional compatibility hint; Pi uses its active native session" })),
		}),
		async execute(_toolCallId, params, signal) {
			const input = params as { enable?: boolean; persistent?: boolean };
			const persistent = Boolean(input.persistent);
			if (!persistent && !sessionId) {
				throw new Error("No active Pi session is registered yet.");
			}

			const enable = Boolean(input.enable);
			try {
				if (!(await ensureServeTask())) {
					throw new Error("Trajectory serve is not ready");
				}
				const query = persistent
					? `scope=user&enable=${enable}`
					: `session_id=${encodeURIComponent(sessionId)}&enable=${enable}`;
				const res = await fetch(
					`${baseUrl}/session/incognito?${query}`,
					{
						method: "POST",
						signal: signal ?? AbortSignal.timeout(POST_TIMEOUT_MS),
					},
				);
				if (!res.ok) {
					const body = await res.text();
					throw new Error(`${res.status} ${body}`.trim());
				}
				if (persistent) {
					return {
						content: [{ type: "text", text: `Persistent incognito ${enable ? "enabled" : "disabled"} for this user.` }],
						details: { fallback: "serve", persistent: true },
					};
				}
				const state = enable ? "enabled" : "disabled";
				const detail = enable
					? "content publish to non-exempt Datadog destinations is suppressed; local JSONL capture and redacted accounting/activity metrics continue"
					: "publish to non-exempt Datadog destinations is resumed";
				return {
					content: [{ type: "text", text: `Incognito ${state} for session ${sessionId}; ${detail}.` }],
					details: { fallback: "serve" },
				};
			} catch (err) {
				if (persistent && !signal?.aborted) {
					try {
						return await setPersistentIncognitoWithLocalFallback(enable, err, signal);
					} catch (fallbackErr) {
						const primary = err instanceof Error ? err.message : String(err);
						const fallback = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
						throw new Error(`Incognito toggle failed: ${primary}; ${fallback}`, { cause: fallbackErr });
					}
				}
				if (enable && !signal?.aborted) {
					try {
						return await enableIncognitoWithLocalFallback(err, signal);
					} catch (fallbackErr) {
						const primary = err instanceof Error ? err.message : String(err);
						const fallback = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
						throw new Error(`Incognito toggle failed: ${primary}; ${fallback}`, { cause: fallbackErr });
					}
				}
				const detail = err instanceof Error ? err.message : String(err);
				throw new Error(`Incognito toggle failed: ${detail}`, { cause: err });
			}
		},
	});

	pi.registerTool({
		name: "trajectory_schema",
		label: "Trajectory Schema",
		description: "Introspects the local Trajectory SQLite cache schema. Call this before trajectory_query so SQL matches the live cache.",
		parameters: Type.Object({
			include_row_counts: Type.Optional(Type.Boolean({ description: "Include SELECT COUNT(*) per table. Defaults to false." })),
		}),
		async execute(_toolCallId, params) {
			const result = buildTrajectorySchema(Boolean((params as { include_row_counts?: boolean }).include_row_counts));
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				details: { result },
				isError: !result.ok,
			};
		},
	});

	pi.registerTool({
		name: "trajectory_query",
		label: "Trajectory Query",
		description: "Runs a guarded read-only SQL query against the local Trajectory SQLite cache. Call trajectory_schema first unless the schema was already fetched. Only SELECT, WITH, and PRAGMA are allowed after stripping comments.",
		parameters: Type.Object({
			query: Type.String({ description: "SQL query. First keyword after comments must be SELECT, WITH, or PRAGMA." }),
			params: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Optional named SQL parameters. Use placeholders such as :session_id." })),
			limit: Type.Optional(Type.Number({ description: "Maximum rows to return. Defaults to 100, max 1000." })),
			row_limit: Type.Optional(Type.Number({ description: "Alias for limit." })),
		}),
		async execute(_toolCallId, params) {
			const result = runTrajectoryQuery(params as {
				query: string;
				params?: Record<string, string | number | boolean | null>;
				limit?: number;
				row_limit?: number;
			});
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				details: { result },
				isError: !result.ok,
			};
		},
	});

	// ── CLI fallback for session lifecycle events ───────────────────
	// Session lifecycle events (start/end) use CLI fallback to write directly
	// to JSONL, independent of serve availability. Matches CC plugin pattern.

	async function captureHookCLI(eventType: string, body: Record<string, unknown>, deliveryId: string): Promise<void> {
		const home = resolvePiTrajectoryHome();
		const binPath = findTrajectoryBinary(home);
		if (!binPath) return;
		await new Promise<void>((resolve) => {
			let child: ReturnType<typeof spawn>;
			try {
				// --client pi keeps the helper's notify on the Pi runtime. The helper
				// writes JSONL before notifying serve, so it remains the durable
				// fallback for short-lived `pi --print` sessions.
				child = spawn(binPath, [
					"capture-hook", "--client", "pi", "--wait-notify", "500ms",
					"--capture-delivery-id", deliveryId, eventType,
				], {
					detached: true,
					stdio: ["pipe", "ignore", "ignore"],
					env: childEnvironmentForHome(home),
				});
			} catch {
				resolve();
				return;
			}

			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(killTimer);
				resolve();
			};
			const killTimer = setTimeout(() => {
				// This is an owned per-event helper. Force its bounded termination so
				// a wedged notify cannot permanently block TurnEnd and SessionEnd.
				try {
					child.kill("SIGKILL");
				} catch {
					// Best-effort termination; finish still releases the serialized queue.
				}
				finish();
			}, CAPTURE_HELPER_TIMEOUT_MS);
			(killTimer as unknown as { unref?: () => void }).unref?.();
			child.once("error", finish);
			child.once("close", finish);
			child.stdin?.once("error", () => {});
			child.stdin?.end(JSON.stringify(withPluginProvenance(body)));
			child.unref();
		});
	}

	const captureHookTask = runtime.captureHook ?? captureHookCLI;

	async function captureHookBatchCLI(captures: CaptureHookBatchItem[]): Promise<void> {
		const home = resolvePiTrajectoryHome();
		const binPath = findTrajectoryBinary(home);
		if (!binPath || captures.length === 0) return;
		await new Promise<void>((resolve) => {
			let child: ReturnType<typeof spawn>;
			try {
				child = spawn(binPath, [
					"capture-hook", "--batch", "--background-after-read",
					"--client", "pi", "--wait-notify", "2s",
				], {
					detached: true,
					stdio: ["pipe", "ignore", "ignore"],
					env: childEnvironmentForHome(home),
				});
			} catch {
				resolve();
				return;
			}

			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve();
			};
			const timer = setTimeout(finish, CAPTURE_BATCH_HANDOFF_TIMEOUT_MS);
			(timer as unknown as { unref?: () => void }).unref?.();
			child.once("error", finish);
			child.once("close", finish);
			child.stdin?.once("error", finish);
			child.stdin?.once("finish", finish);
			child.stdin?.end(JSON.stringify(captures.map((capture) => ({
				...capture,
				body: withPluginProvenance(capture.body),
			}))));
			child.unref();
		});
	}

	const captureHookBatchTask = runtime.captureHookBatch ?? captureHookBatchCLI;

	function captureDeliveryId(): string {
		return `dly_${randomBytes(16).toString("hex")}`;
	}

	function enqueueCapture(eventType: string, body: Record<string, unknown>, lifecycle: boolean, terminal = false): void {
		const capture: CaptureHookBatchItem = {
			event_type: eventType,
			body,
			delivery_id: captureDeliveryId(),
		};
		pendingCaptures.add(capture);
		const task = async () => {
			try {
				await captureHookTask(eventType, body, capture.delivery_id);
			} finally {
				pendingCaptures.delete(capture);
			}
		};
		const onDrop = () => pendingCaptures.delete(capture);
		const admitted = terminal
			? captureQueue.enqueueTerminal(task, onDrop)
			: lifecycle
				? captureQueue.enqueueLifecycle(task, onDrop)
				: captureQueue.enqueue(task, onDrop);
		if (!admitted) pendingCaptures.delete(capture);
	}

	function post(path: string, body: Record<string, unknown>): void {
		enqueueCapture(path, body, false);
	}

	function captureLifecycle(eventType: string, body: Record<string, unknown>): void {
		enqueueCapture(eventType, body, true);
	}

	function captureTerminalLifecycle(eventType: string, body: Record<string, unknown>): void {
		enqueueCapture(eventType, body, true, true);
	}

	function completeAgentRun(sourceDialect: string): boolean {
		if (unsettledMessages.length === 0) return false;
		const sourceEventId = agentRuns.complete();
		if (!sourceEventId) return false;
		const settledMessages = unsettledMessages;
		const aggregate = aggregatePiAgentRun(settledMessages);
		const nativeRequests = summarizePiAgentRunRequests(settledMessages);
		unsettledMessages = [];

		const body: Record<string, unknown> = {
			session_id: sessionId,
			source_event_id: sourceEventId,
			source_dialect: sourceDialect,
			native_requests: nativeRequests,
			usage: aggregate.usage,
			native_request_count: aggregate.requestCount,
			zero_usage_requests: aggregate.zeroUsageRequests,
			usage_model_status: aggregate.modelStatus,
			cost_status: aggregate.costStatus,
			timestamp: Date.now(),
		};
		if (aggregate.model) body.model = aggregate.model;
		if (aggregate.provider) body.provider = aggregate.provider;
		captureLifecycle("TurnEnd", body);
		return true;
	}

	function contentBlockTypes(blocks: any): string[] {
		if (!Array.isArray(blocks)) {
			return [];
		}
		const out = new Set<string>();
		for (const block of blocks) {
			if (block?.type === "text") out.add("text");
			else if (block?.type === "thinking") out.add("thinking");
			else if (block?.type === "toolCall") out.add("tool_use");
			else if (typeof block?.type === "string" && block.type) out.add(block.type);
		}
		return Array.from(out);
	}

	// ── Event subscriptions ──────────────────────────────────────────

	pi.on("session_start", async (event, ctx) => {
		const parentProviderSessionId = await readPiSessionHeaderId(event.previousSessionFile);
		const identity = piSessionIdentityFields(event, ctx.sessionManager, parentProviderSessionId, process.env);
		sessionId = identity.session_id;
		agentRuns.reset(sessionId);
		unsettledMessages = [];

		const body = {
			...identity,
			cwd: ctx.cwd,
			model: ctx.model?.id,
			provider: ctx.model?.provider,
			timestamp: Date.now(),
			extensions: await listInstalledExtensions(),
			session_start_reason: event.reason,
		};

		captureLifecycle("SessionStart", body);

		// Serve recovery is independent of ordered local capture. A short Pi
		// session must still drain TurnEnd and SessionEnd when ensure takes
		// longer than the shutdown budget.
		void Promise.resolve()
			.then(() => ensureServeTask())
			.catch(() => {});
	});

	pi.on("agent_start", async () => {
		agentRuns.start();
	});

	pi.on("message_end", async (event, ctx) => {

		const msg = event.message;

		if (msg.role === "user") {
			// Pi releases before agent_settled do not expose that lifecycle event.
			// When the next user message arrives, the previous agent_end is an
			// unambiguous completed interaction. Finalize it before admitting the
			// new prompt, then establish the run that the current prompt belongs to.
			if (unsettledMessages.length > 0 && completeAgentRun("pi-agent-end-next-user")) {
				agentRuns.start();
			}
			const prompt =
				typeof msg.content === "string"
					? msg.content
					: msg.content
							.filter((b: any): b is { type: "text"; text: string } => b.type === "text")
							.map((b: { type: "text"; text: string }) => b.text)
							.join("\n");

			post("UserPromptSubmit", {
				session_id: sessionId,
				prompt,
				timestamp: Date.now(),
			});
		} else if (msg.role === "assistant") {
			const textParts: string[] = [];
			const thinkingParts: string[] = [];
			const toolCallIds: string[] = [];
			let hasThinking = false;

			for (const block of msg.content) {
				if (block.type === "text") {
					textParts.push(block.text);
				} else if (block.type === "thinking") {
					hasThinking = true;
					if (!block.redacted) {
						thinkingParts.push(block.thinking);
					}
				} else if (block.type === "toolCall") {
					toolCallIds.push(block.id);
				}
			}

			post("AgentMessage", {
				session_id: sessionId,
				text: textParts.join("\n"),
				has_thinking: hasThinking,
				thinking_text: thinkingParts.join("\n"),
				tool_use_ids: toolCallIds,
				model: msg.model,
				provider: ctx.model?.provider,
				usage: msg.usage,
				content_blocks: contentBlockTypes(msg.content),
				timestamp: Date.now(),
			});
		}
	});

	pi.on("tool_call", async (event, _ctx) => {
		post("PreToolUse", {
			session_id: sessionId,
			tool_use_id: event.toolCallId,
			tool_name: event.toolName,
			input: event.input,
			timestamp: Date.now(),
		});
	});

	pi.on("tool_result", async (event, _ctx) => {


		const output = event.content
			.filter((b): b is { type: "text"; text: string } => b.type === "text")
			.map((b) => b.text)
			.join("\n");

		post("PostToolUse", {
			session_id: sessionId,
			tool_use_id: event.toolCallId,
			tool_name: event.toolName,
			output,
			is_error: event.isError,
			timestamp: Date.now(),
		});
	});

	pi.on("agent_end", async (event, _ctx) => {
		if (Array.isArray(event.messages)) unsettledMessages.push(...event.messages);
	});

	pi.on("agent_settled", async (_event, _ctx) => {
		completeAgentRun("pi-agent-settled");
	});

	pi.on("session_compact", async (event, _ctx) => {


		post("PostCompact", {
			session_id: sessionId,
			summary: event.compactionEntry.summary,
			tokens_before: event.compactionEntry.tokensBefore,
			timestamp: Date.now(),
		});
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		// Legacy Pi has agent_end but no agent_settled. The terminal boundary is
		// the final unambiguous chance to preserve its last interaction.
		if (unsettledMessages.length > 0) completeAgentRun("pi-agent-end-session-shutdown");
		const body: Record<string, unknown> = {
			session_id: sessionId,
			timestamp: Date.now(),
		};

		// CLI writes directly to JSONL (always works, even if serve is dead)
		captureTerminalLifecycle("SessionEnd", body);

		// Preserve the fast path when the queue is already close to idle. If a
		// helper is slow, move every incomplete admitted event into one detached
		// receipt-backed batch so ordering and SessionEnd survive Pi process exit.
		const drainMs = runtime.shutdownDrainMs ?? SHUTDOWN_DRAIN_MS;
		if (await captureQueue.drain(drainMs)) return;
		captureQueue.takePendingForHandoff();
		const captures = Array.from(pendingCaptures);
		if (captures.length > 0) await captureHookBatchTask(captures);
	});

	pi.on("model_select", async (event, _ctx) => {


		post("ModelChange", {
			session_id: sessionId,
			provider: event.model.provider,
			model_id: event.model.id,
			timestamp: Date.now(),
		});
	});

}

export default function trajectoryExtension(pi: ExtensionAPI): void {
	registerTrajectoryExtension(pi);
}
