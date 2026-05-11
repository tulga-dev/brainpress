import type { AgentRunStatus } from "@/lib/types";

export type CodexRunEventType =
  | "run_started"
  | "stdout"
  | "stderr"
  | "run_cancel_requested"
  | "run_cancelled"
  | "run_timed_out"
  | "run_completed"
  | "run_failed"
  | "git_snapshot_captured"
  | "verification_started"
  | "verification_completed";

export interface CodexRunEvent {
  timestamp: string;
  runId: string;
  type: CodexRunEventType;
  payload: Record<string, unknown>;
}

export interface DiffPreviewMetadata {
  length: number;
  truncated: boolean;
  changedFiles: string[];
  previewLimit: number;
}

export interface CodexRunState {
  runId: string;
  status: AgentRunStatus;
  startedAt?: string;
  endedAt?: string;
  exitCode: number | null;
  durationMs: number | null;
  cancelled: boolean;
  timedOut: boolean;
  gitStatusBefore: string;
  gitStatusAfter: string;
  gitDiffStat: string;
  diffPreviewMetadata: DiffPreviewMetadata;
}

export function createRunEvent(
  runId: string,
  type: CodexRunEventType,
  payload: Record<string, unknown> = {},
  timestamp = new Date().toISOString(),
): CodexRunEvent {
  return {
    timestamp,
    runId,
    type,
    payload,
  };
}

export function serializeRunEvent(event: CodexRunEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function parseRunEvents(jsonl: string): CodexRunEvent[] {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CodexRunEvent);
}

export function statusFromCodexStreamResult({
  cancelled,
  timedOut,
  exitCode,
}: {
  cancelled: boolean;
  timedOut: boolean;
  exitCode: number | null;
}): AgentRunStatus {
  if (cancelled) return "Cancelled";
  if (timedOut) return "TimedOut";
  if (exitCode === 0) return "DiffReviewRequired";
  return "CodexFailed";
}

export function nextTaskForInterruptedRun(status: AgentRunStatus, outcomeTitle: string) {
  if (status === "Cancelled") return `Resume or restart cancelled Codex run for ${outcomeTitle}`;
  if (status === "TimedOut") return `Continue timed-out Codex run for ${outcomeTitle}`;
  return "";
}
