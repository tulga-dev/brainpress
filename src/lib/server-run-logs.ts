import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getRunDirectory, isPathInside } from "@/lib/codex-bridge";
import {
  createRunEvent,
  parseRunEvents,
  serializeRunEvent,
  type CodexRunEvent,
  type CodexRunState,
} from "@/lib/run-events";

export const codexStreamTimeoutMs = 10 * 60 * 1000;
export const diffPreviewLimit = 20_000;

export interface ActiveCodexRun {
  runId: string;
  repoPath: string;
  runDirectory: string;
  lockPath: string;
  child: ChildProcessWithoutNullStreams;
  startedAt: string;
  cancelRequested: boolean;
  timedOut: boolean;
}

export interface PersistedRunLogs {
  stdout: string;
  stderr: string;
  events: CodexRunEvent[];
  runState: CodexRunState | null;
  message: string;
}

const registryKey = "__brainpressActiveCodexRuns";

type BrainpressGlobal = typeof globalThis & {
  [registryKey]?: Map<string, ActiveCodexRun>;
};

function activeRuns() {
  const globalRegistry = globalThis as BrainpressGlobal;
  if (!globalRegistry[registryKey]) {
    globalRegistry[registryKey] = new Map<string, ActiveCodexRun>();
  }
  return globalRegistry[registryKey];
}

export function hasActiveCodexRun(runId: string) {
  return activeRuns().has(runId);
}

export function registerActiveCodexRun(run: ActiveCodexRun) {
  activeRuns().set(run.runId, run);
}

export function getActiveCodexRun(runId: string) {
  return activeRuns().get(runId);
}

export function unregisterActiveCodexRun(runId: string) {
  activeRuns().delete(runId);
}

export async function cancelActiveCodexRun(runId: string) {
  const active = getActiveCodexRun(runId);
  if (!active) {
    return {
      cancelled: false,
      message: "No active Codex run exists for this AgentRun. It may have already finished, failed, or been cancelled.",
    };
  }

  active.cancelRequested = true;
  await appendRunEvent(active.repoPath, createRunEvent(runId, "run_cancel_requested", { reason: "user_cancelled" }));
  active.child.kill("SIGTERM");
  return {
    cancelled: true,
    message: "Cancel requested. Brainpress will preserve partial logs and no memory will be absorbed automatically.",
  };
}

export function getRunLogPaths(repoPath: string, runId: string) {
  const runDirectory = getRunDirectory(repoPath, runId);
  return {
    runDirectory,
    stdoutPath: path.join(/*turbopackIgnore: true*/ runDirectory, "stdout.log"),
    stderrPath: path.join(/*turbopackIgnore: true*/ runDirectory, "stderr.log"),
    eventsPath: path.join(/*turbopackIgnore: true*/ runDirectory, "events.jsonl"),
    statePath: path.join(/*turbopackIgnore: true*/ runDirectory, "run-state.json"),
    lockPath: path.join(/*turbopackIgnore: true*/ runDirectory, "codex.lock"),
  };
}

export function validateRunLogPath(repoPath: string, runId: string, candidatePath: string) {
  const runDirectory = getRunDirectory(repoPath, runId);
  if (!isPathInside(runDirectory, candidatePath)) {
    return { ok: false, error: "Run log files must stay inside .brainpress/runs/<runId>." };
  }
  return { ok: true };
}

export async function initializeRunLogFiles(repoPath: string, runId: string) {
  const paths = getRunLogPaths(repoPath, runId);
  await mkdir(paths.runDirectory, { recursive: true });
  await Promise.all([
    writeFile(paths.stdoutPath, "", "utf8"),
    writeFile(paths.stderrPath, "", "utf8"),
    writeFile(paths.eventsPath, "", "utf8"),
  ]);
  return paths;
}

export async function appendRunEvent(repoPath: string, event: CodexRunEvent) {
  const paths = getRunLogPaths(repoPath, event.runId);
  await mkdir(paths.runDirectory, { recursive: true });
  await appendFile(paths.eventsPath, serializeRunEvent(event), "utf8");
}

export async function appendStdout(repoPath: string, runId: string, value: string) {
  const paths = getRunLogPaths(repoPath, runId);
  await appendFile(paths.stdoutPath, value, "utf8");
}

export async function appendStderr(repoPath: string, runId: string, value: string) {
  const paths = getRunLogPaths(repoPath, runId);
  await appendFile(paths.stderrPath, value, "utf8");
}

export async function writeRunState(repoPath: string, state: CodexRunState) {
  const paths = getRunLogPaths(repoPath, state.runId);
  await mkdir(paths.runDirectory, { recursive: true });
  await writeFile(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function readPersistedRunLogs(repoPath: string, runId: string): Promise<PersistedRunLogs> {
  const paths = getRunLogPaths(repoPath, runId);
  if (!existsSync(paths.runDirectory)) {
    return emptyRunLogs("No persisted logs found yet. Run Codex streaming once, then reload logs.");
  }

  const [stdout, stderr, eventsJsonl, stateJson] = await Promise.all([
    readOptional(paths.stdoutPath),
    readOptional(paths.stderrPath),
    readOptional(paths.eventsPath),
    readOptional(paths.statePath),
  ]);

  return {
    stdout,
    stderr,
    events: eventsJsonl ? parseRunEvents(eventsJsonl) : [],
    runState: stateJson ? (JSON.parse(stateJson) as CodexRunState) : null,
    message: eventsJsonl || stdout || stderr || stateJson ? "Persisted logs loaded." : "Run directory exists, but logs are empty.",
  };
}

export function emptyRunLogs(message: string): PersistedRunLogs {
  return {
    stdout: "",
    stderr: "",
    events: [],
    runState: null,
    message,
  };
}

async function readOptional(filePath: string) {
  if (!existsSync(filePath)) return "";
  return readFile(filePath, "utf8");
}
