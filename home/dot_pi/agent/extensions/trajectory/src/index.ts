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
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BoundedSerialQueue } from "./async-queue.ts";
import { aggregatePiAgentRun, PiAgentRunTracker, summarizePiAgentRunRequests } from "./agent-run.ts";
import { buildTrajectorySchema, runTrajectoryQuery } from "./query-tools.ts";
import { piSessionIdentityFields, readPiSessionHeaderId } from "./session-identity.ts";
import { listInstalledExtensions } from "./extension-inventory.ts";
import { ensureTrajectoryServe as requestTrajectoryServe } from "./serve-ensure.ts";

const DEFAULT_PORT = 19222;
const POST_TIMEOUT_MS = 2000;
const CAPTURE_HELPER_TIMEOUT_MS = 5000;
const CAPTURE_QUEUE_CAPACITY = 256;
// One ordinary helper may already be running when shutdown starts. Budget its
// hard timeout, two receipt-notify windows for TurnEnd and SessionEnd, and a
// small scheduling margin after the pending ordinary tail is discarded.
const SHUTDOWN_DRAIN_MS = CAPTURE_HELPER_TIMEOUT_MS + (2 * POST_TIMEOUT_MS) + 1000;
const PLUGIN_PROVENANCE = {
	plugin: {
		id: "trajectory-pi",
		version: "3.2.6",
		source_scope: "trajectory_plugin",
	},
};
export interface TrajectoryExtensionRuntime {
	captureQueue?: BoundedSerialQueue;
	captureHook?: (eventType: string, body: Record<string, unknown>) => Promise<void>;
	ensureServe?: () => Promise<boolean>;
	shutdownDrainMs?: number;
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

	let sessionId = "";
	const agentRuns = new PiAgentRunTracker();
	let unsettledMessages: unknown[] = [];

	// ── Receipt-backed binary delivery ───────────────────────────────

	function findTrajectoryBinary(): string | undefined {
		const candidates = [
			join(process.env.HOME ?? "", ".trajectory", "bin", "trajectory"),
			join(process.env.HOME ?? "", "bin", "trajectory"),
			// Let PATH resolve it as a fallback (handled by execFile)
		];
		for (const p of candidates) {
			if (existsSync(p)) return p;
		}
		// Fall back to bare name — execFile will search PATH
		return "trajectory";
	}

	async function ensureTrajectoryServe(): Promise<boolean> {
		const binPath = findTrajectoryBinary();
		if (!binPath) return false;
		const result = await requestTrajectoryServe({ binary: binPath, client: "pi", port });
		return result.ok;
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
		description: "Toggles incognito mode for the current Pi session. Local JSONL capture and accounting/activity metrics continue; content publish to non-exempt Datadog destinations is suppressed, and metrics omit explicit model and repository identity by default.",
		parameters: Type.Object({
			enable: Type.Boolean({ description: "true to enable incognito, false to disable it" }),
		}),
		async execute(_toolCallId, params, signal) {
			if (!sessionId) {
				return {
					content: [{ type: "text", text: "No active Pi session is registered yet." }],
					details: {},
					isError: true,
				};
			}

			const enable = Boolean((params as { enable?: boolean }).enable);
			try {
				await ensureTrajectoryServe();
				const res = await fetch(
					`${baseUrl}/session/incognito?session_id=${encodeURIComponent(sessionId)}&enable=${enable}`,
					{
						method: "POST",
						signal: signal ?? AbortSignal.timeout(POST_TIMEOUT_MS),
					},
				);
				if (!res.ok) {
					const body = await res.text();
					return {
						content: [{ type: "text", text: `Incognito toggle failed: ${res.status} ${body}` }],
						details: {},
						isError: true,
					};
				}
				const state = enable ? "enabled" : "disabled";
				const detail = enable
					? "content publish to non-exempt Datadog destinations is suppressed; local JSONL capture and redacted accounting/activity metrics continue"
					: "publish to non-exempt Datadog destinations is resumed";
				return {
					content: [{ type: "text", text: `Incognito ${state} for session ${sessionId}; ${detail}.` }],
					details: {},
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Incognito toggle failed: ${err}` }],
					details: {},
					isError: true,
				};
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

	async function captureHookCLI(eventType: string, body: Record<string, unknown>): Promise<void> {
		const binPath = findTrajectoryBinary();
		if (!binPath) return;
		await new Promise<void>((resolve) => {
			let child: ReturnType<typeof spawn>;
			try {
				// --client pi keeps the helper's notify on the Pi runtime. The helper
				// writes JSONL before notifying serve, so it remains the durable
				// fallback for short-lived `pi --print` sessions.
				child = spawn(binPath, ["capture-hook", "--client", "pi", "--wait-notify", "2s", eventType], {
					detached: true,
					stdio: ["pipe", "ignore", "ignore"],
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

	function post(path: string, body: Record<string, unknown>): void {
		captureQueue.enqueue(() => captureHookTask(path, body));
	}

	function captureLifecycle(eventType: string, body: Record<string, unknown>): void {
		captureQueue.enqueueLifecycle(() => captureHookTask(eventType, body));
	}

	function captureTerminalLifecycle(eventType: string, body: Record<string, unknown>): void {
		captureQueue.enqueueTerminal(() => captureHookTask(eventType, body));
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
		const sourceEventId = agentRuns.complete();
		if (!sourceEventId) return;
		const settledMessages = unsettledMessages;
		const aggregate = aggregatePiAgentRun(settledMessages);
		const nativeRequests = summarizePiAgentRunRequests(settledMessages);
		unsettledMessages = [];

		const body: Record<string, unknown> = {
			session_id: sessionId,
			source_event_id: sourceEventId,
			source_dialect: "pi-agent-settled",
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

		// CLI writes directly to JSONL (always works, even if pi exits before the
		// async POST completes — e.g. under `pi --print`). JSONL is the source of
		// truth; serve picks it up via fsnotify if the live POST is dropped.
		captureLifecycle("TurnEnd", body);
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
		const body: Record<string, unknown> = {
			session_id: sessionId,
			timestamp: Date.now(),
		};

		// CLI writes directly to JSONL (always works, even if serve is dead)
		captureTerminalLifecycle("SessionEnd", body);

		// Pi permits an async shutdown callback. Give already-admitted work one
		// bounded chance to preserve event order through SessionEnd. Detached
		// helpers continue best-effort after this budget.
		const drainMs = runtime.shutdownDrainMs ?? SHUTDOWN_DRAIN_MS;
		await captureQueue.drainLifecycle(drainMs);
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
