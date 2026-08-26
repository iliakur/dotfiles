import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverAgents, type AgentConfig } from "./subagent/agents.ts";

type RunResult = {
  agent: string;
  exitCode: number;
  stderr: string;
  messages: Message[];
};

const PARALLEL_STAGE = ["purpose-agent", "dataflow-agent", "abstractions-agent"] as const;
const SEQUENTIAL_STAGE = ["edgecase-agent", "review-comment-agent"] as const;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildIdentifier(target: string): string {
  const prFromUrl = target.match(/\/pull\/(\d+)/);
  if (prFromUrl) return prFromUrl[1];
  const prFromNumber = target.match(/^#?(\d+)$/);
  if (prFromNumber) return prFromNumber[1];
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const slug = slugify(target);
  return slug ? `${slug}-${date}` : `review-${date}`;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-codereview-large-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
  await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const text = msg.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

async function runAgent(defaultCwd: string, agent: AgentConfig, task: string): Promise<RunResult> {
  const args: string[] = ["--mode", "json", "-p", "--no-session"];
  if (agent.model) args.push("--model", agent.model);
  if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  const result: RunResult = {
    agent: agent.name,
    exitCode: 0,
    stderr: "",
    messages: [],
  };

  try {
    if (agent.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }

    args.push(`Task: ${task}`);

    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: defaultCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let buffer = "";

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if ((event.type === "message_end" || event.type === "tool_result_end") && event.message) {
          result.messages.push(event.message as Message);
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        result.stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });

      proc.on("error", () => {
        resolve(1);
      });
    });

    result.exitCode = exitCode;
    return result;
  } finally {
    if (tmpPromptPath) {
      try {
        fs.unlinkSync(tmpPromptPath);
      } catch {}
    }
    if (tmpPromptDir) {
      try {
        fs.rmdirSync(tmpPromptDir);
      } catch {}
    }
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("codereview-large", {
    description: "Run codereview with a fixed subagent DAG",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        if (ctx.hasUI) ctx.ui.notify("Agent is busy. Run /codereview-large when idle.", "warning");
        return;
      }

      const target = args.trim();
      if (!target) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /codereview-large <PR URL, PR number, or review target>", "warning");
        return;
      }

      const repoName = path.basename(ctx.cwd);
      const identifier = buildIdentifier(target);
      const reviewDir = path.join(os.homedir(), "Documents", "reviews", repoName, identifier);
      await fs.promises.mkdir(reviewDir, { recursive: true });

      const discovery = discoverAgents(ctx.cwd, "user");
      const agentsByName = new Map(discovery.agents.map((a) => [a.name, a]));
      const required = [...PARALLEL_STAGE, ...SEQUENTIAL_STAGE];
      const missing = required.filter((name) => !agentsByName.has(name));

      if (missing.length > 0) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Missing required agents: ${missing.join(", ")}`, "error");
        }
        return;
      }

      if (ctx.hasUI) {
        ctx.ui.notify(`codereview-large: review dir ${reviewDir}`, "info");
      }

      const baseTask = `REVIEW_DIR: ${reviewDir}\nTARGET: ${target}\nSCOPE: ${target}`;

      const parallelTasks = [
        {
          agent: agentsByName.get("purpose-agent")!,
          task: `${baseTask}\nGOAL: Build purpose.md with a purpose-rooted change tree for this target.`,
        },
        {
          agent: agentsByName.get("dataflow-agent")!,
          task: `${baseTask}\nGOAL: Build dataflow.md and dataflow.mmd for this target.`,
        },
        {
          agent: agentsByName.get("abstractions-agent")!,
          task: `${baseTask}\nGOAL: Build abstractions.md for this target.`,
        },
      ];

      const parallelResults = await Promise.all(
        parallelTasks.map(async ({ agent, task }) => {
          const result = await runAgent(ctx.cwd, agent, task);
          if (ctx.hasUI) {
            const level = result.exitCode === 0 ? "info" : "error";
            ctx.ui.notify(`${agent.name}: exit ${result.exitCode}`, level);
          }
          return result;
        }),
      );

      const failedParallel = parallelResults.filter((r) => r.exitCode !== 0);
      if (failedParallel.length > 0) {
        const lines = failedParallel.map((r) => `- ${r.agent}: exit ${r.exitCode}${r.stderr ? `\n  ${r.stderr.trim()}` : ""}`);
        pi.sendMessage({
          customType: "codereview-large-result",
          display: true,
          content: `codereview-large stopped during parallel stage.\n\n${lines.join("\n")}`,
        });
        return;
      }

      const edgecaseAgent = agentsByName.get("edgecase-agent")!;
      const edgecaseResult = await runAgent(
        ctx.cwd,
        edgecaseAgent,
        `${baseTask}\nGOAL: Expand edge cases in dataflow.md based on the generated dataflow artifacts.`,
      );
      if (ctx.hasUI) {
        const level = edgecaseResult.exitCode === 0 ? "info" : "error";
        ctx.ui.notify(`${edgecaseAgent.name}: exit ${edgecaseResult.exitCode}`, level);
      }
      if (edgecaseResult.exitCode !== 0) {
        pi.sendMessage({
          customType: "codereview-large-result",
          display: true,
          content: `codereview-large stopped at edgecase stage.\n\n- ${edgecaseResult.agent}: exit ${edgecaseResult.exitCode}\n${edgecaseResult.stderr.trim()}`,
        });
        return;
      }

      const commentAgent = agentsByName.get("review-comment-agent")!;
      const commentResult = await runAgent(
        ctx.cwd,
        commentAgent,
        `${baseTask}\nGOAL: Build review-comments.md using purpose.md, dataflow.md, and abstractions.md in REVIEW_DIR.`,
      );
      if (ctx.hasUI) {
        const level = commentResult.exitCode === 0 ? "info" : "error";
        ctx.ui.notify(`${commentAgent.name}: exit ${commentResult.exitCode}`, level);
      }

      if (commentResult.exitCode !== 0) {
        pi.sendMessage({
          customType: "codereview-large-result",
          display: true,
          content: `codereview-large stopped at review comments stage.\n\n- ${commentResult.agent}: exit ${commentResult.exitCode}\n${commentResult.stderr.trim()}`,
        });
        return;
      }

      const summary = [
        `codereview-large completed for target: ${target}`,
        `review dir: ${reviewDir}`,
        "",
        "Artifacts expected:",
        "- purpose.md",
        "- dataflow.md",
        "- dataflow.mmd",
        "- abstractions.md",
        "- review-comments.md",
        "",
        "Final agent output:",
        getFinalOutput(commentResult.messages) || "(no output)",
      ].join("\n");

      pi.sendMessage({ customType: "codereview-large-result", display: true, content: summary });
    },
  });
}
