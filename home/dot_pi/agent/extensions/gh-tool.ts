import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type GhOrg = "DataDog" | "ddoghq";

type GhRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code?: number;
};

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "gh_cli",
    label: "GitHub CLI",
    description: "Run GitHub CLI commands with auth preflight and ddtool-based remediation",
    promptSnippet: "Run GitHub CLI operations (pr, issue, repo) with gh",
    promptGuidelines: [
      "Use gh_cli for GitHub operations instead of generic bash when possible.",
      "When targeting ddoghq/* repos, set org to ddoghq.",
    ],
    parameters: Type.Object({
      args: Type.Array(Type.String(), {
        description: "Arguments passed to gh, e.g. ['pr','view','123','--json','title,body,url']",
      }),
      org: Type.Optional(
        Type.Union([Type.Literal("DataDog"), Type.Literal("ddoghq")], {
          description: "Optional org for ddtool token selection",
        }),
      ),
      cwd: Type.Optional(Type.String({ description: "Working directory" })),
      timeoutSec: Type.Optional(Type.Number({ minimum: 1, maximum: 120 })),
    }),
    async execute(_toolCallId, params) {
      if (!params.args.length) {
        return {
          content: [{ type: "text", text: "args cannot be empty" }],
          isError: true,
        };
      }

      const blocked = new Set(["auth", "alias", "extension"]);
      if (blocked.has(params.args[0])) {
        return {
          content: [{ type: "text", text: `gh subcommand '${params.args[0]}' is blocked` }],
          isError: true,
        };
      }

      const org = params.org ?? inferOrgFromArgs(params.args) ?? "DataDog";
      const timeoutMs = (params.timeoutSec ?? 30) * 1000;
      const baseEnv = process.env as Record<string, string>;
      let env: Record<string, string> = { ...baseEnv };

      const authOk = await isGhAuthenticated(params.cwd, timeoutMs, env);
      if (!authOk) {
        const token = await mintToken(org, params.cwd, timeoutMs);
        env = { ...env, GH_TOKEN: token };
      }

      const first = await runGh(params.args, params.cwd, timeoutMs, env);
      if (!first.ok && isAuthFailure(first.stderr)) {
        const token = await mintToken(org, params.cwd, timeoutMs);
        env = { ...env, GH_TOKEN: token };
        const second = await runGh(params.args, params.cwd, timeoutMs, env);
        return second.ok ? toSuccess(second) : toError(second);
      }

      return first.ok ? toSuccess(first) : toError(first);
    },
  });
}

async function runGh(
  args: string[],
  cwd: string | undefined,
  timeoutMs: number,
  env: Record<string, string>,
): Promise<GhRunResult> {
  try {
    const { stdout, stderr } = await execFileAsync("gh", args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env,
    });
    return { ok: true, stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (err: any) {
    return {
      ok: false,
      stdout: err?.stdout ?? "",
      stderr: err?.stderr ?? err?.message ?? "unknown error",
      code: err?.code,
    };
  }
}

async function isGhAuthenticated(
  cwd: string | undefined,
  timeoutMs: number,
  env: Record<string, string>,
): Promise<boolean> {
  const result = await runGh(["auth", "status", "-h", "github.com"], cwd, timeoutMs, env);
  return result.ok;
}

async function mintToken(org: GhOrg, cwd: string | undefined, timeoutMs: number): Promise<string> {
  const cmd = org === "ddoghq" ? "ddtool auth github token --org ddoghq" : "ddtool auth github token";
  const { stdout } = await execFileAsync("bash", ["-lc", cmd], {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 256 * 1024,
  });
  const token = (stdout ?? "").trim();
  if (!token) throw new Error("Failed to obtain GH token from ddtool");
  return token;
}

function isAuthFailure(stderr: string): boolean {
  const s = (stderr || "").toLowerCase();
  return (
    s.includes("bad credentials") ||
    s.includes("http 401") ||
    s.includes("requires authentication") ||
    s.includes("not logged into any github hosts")
  );
}

function inferOrgFromArgs(args: string[]): GhOrg | undefined {
  const joined = args.join(" ").toLowerCase();
  if (joined.includes("ddoghq/")) return "ddoghq";
  if (joined.includes("datadog/")) return "DataDog";
  return undefined;
}

function toSuccess(result: GhRunResult) {
  const text = [result.stdout && `stdout:\n${result.stdout}`, result.stderr && `stderr:\n${result.stderr}`]
    .filter(Boolean)
    .join("\n\n") || "(no output)";
  return {
    content: [{ type: "text", text }],
    details: { stdout: result.stdout, stderr: result.stderr },
  };
}

function toError(result: GhRunResult) {
  return {
    content: [
      {
        type: "text",
        text: `gh command failed\n\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`,
      },
    ],
    details: { stdout: result.stdout, stderr: result.stderr, exitCode: result.code },
    isError: true,
  };
}
