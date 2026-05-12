"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  FileCode2,
  Play,
  Send,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { generateHandoffPackage } from "@/lib/agent-runs";
import {
  buildExecutionReadiness,
  canAbsorbWithConfirmation,
  criticalReadinessFailures,
  isProtectedBranch,
  readinessAllowsRun,
  requiresVerificationSkippedReason,
  type ReadinessItem,
} from "@/lib/execution-readiness";
import type { AgentRun, Outcome, Project } from "@/lib/types";
import type { CodexRunEvent } from "@/lib/run-events";
import { allowedVerificationCommands, summarizeVerificationResults } from "@/lib/verification";
import {
  Button,
  EmptyState,
  FieldLabel,
  MonoBlock,
  Panel,
  PanelBody,
  SectionHeader,
  StatusPill,
  cx,
} from "@/components/brainpress/ui";

export function AgentRunsTab({
  project,
  outcomes,
  agentRuns,
  selectedRunId,
  selectedCommands,
  copiedKey,
  verifyingRunId,
  verificationError,
  bridgeError,
  bridgeBusyId,
  streamingRunId,
  streamStartedAtByRun,
  liveLogsByRun,
  onSelectRun,
  onPrepareHandoff,
  onToggleCommand,
  onRunVerification,
  onCheckCodex,
  onPrepareDiskPackage,
  onGitPreflight,
  onRunCodex,
  onCancelRun,
  onLoadLogs,
  onMarkDiffReviewed,
  onAbsorbResult,
  onCopy,
  onDownload,
  onIngestResult,
}: {
  project: Project;
  outcomes: Outcome[];
  agentRuns: AgentRun[];
  selectedRunId: string;
  selectedCommands: string[];
  copiedKey: string | null;
  verifyingRunId: string | null;
  verificationError: string;
  bridgeError: string;
  bridgeBusyId: string | null;
  streamingRunId: string | null;
  streamStartedAtByRun: Record<string, string>;
  liveLogsByRun: Record<string, { stdout: string; stderr: string; events: CodexRunEvent[]; message?: string }>;
  onSelectRun: (runId: string) => void;
  onPrepareHandoff: () => void;
  onToggleCommand: (command: string, checked: boolean) => void;
  onRunVerification: (run: AgentRun, commands: string[]) => void;
  onCheckCodex: (run: AgentRun) => void;
  onPrepareDiskPackage: (run: AgentRun) => void;
  onGitPreflight: (run: AgentRun) => void;
  onRunCodex: (run: AgentRun, options?: { protectedBranchConfirmed?: boolean }) => void;
  onCancelRun: (run: AgentRun) => void;
  onLoadLogs: (run: AgentRun) => void;
  onMarkDiffReviewed: (run: AgentRun) => void;
  onAbsorbResult: (run: AgentRun, skippedVerificationReason: string) => void;
  onCopy: (key: string, value: string) => void;
  onDownload: (filename: string, value: string, mimeType: string) => void;
  onIngestResult: (run: AgentRun) => void;
}) {
  const [approvalCheckedByRun, setApprovalCheckedByRun] = useState<Record<string, boolean>>({});
  const [protectedBranchApprovalByRun, setProtectedBranchApprovalByRun] = useState<Record<string, boolean>>({});
  const [absorbChecksByRun, setAbsorbChecksByRun] = useState<Record<string, { diff: boolean; memory: boolean }>>({});
  const [skipReasonByRun, setSkipReasonByRun] = useState<Record<string, string>>({});
  const selectedRun = agentRuns.find((run) => run.id === selectedRunId) || agentRuns[0];
  const selectedOutcome = selectedRun ? outcomes.find((outcome) => outcome.id === selectedRun.outcomeId) : undefined;
  const handoff = selectedRun ? generateHandoffPackage(selectedRun, project) : undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-5">
        <Panel>
          <PanelBody>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-ink">Founder Safety</p>
                <p className="mt-2 text-sm leading-6 text-slateText">
                  Brainpress includes founder-safe permission rules so coding agents do not ask non-technical founders to approve risky actions blindly.
                </p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-electric">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-ink">Safe handoff mode</p>
                <p className="mt-2 text-sm leading-6 text-slateText">
                  Brainpress only runs local Codex after an explicit approval click. Claude Code remains handoff-only. Verification stays limited to the allowlist, and direct runs require disk package prep, git preflight, and diff review before absorb.
                </p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <SectionHeader
              title="Agent Runs"
              eyebrow="Handoff"
              action={
                <Button variant="primary" onClick={onPrepareHandoff} disabled={!outcomes.length}>
                  <Send className="h-4 w-4" />
                  Prepare Handoff
                </Button>
              }
            />
            {agentRuns.length ? (
              <div className="space-y-3">
                {agentRuns.map((run) => {
                  const outcome = outcomes.find((item) => item.id === run.outcomeId);
                  const active = run.id === selectedRun?.id;

                  return (
                    <button
                      key={run.id}
                      className={cx(
                        "w-full rounded-lg border bg-white p-4 text-left transition hover:border-electric/40",
                        active ? "border-electric shadow-sm" : "border-line",
                      )}
                      onClick={() => onSelectRun(run.id)}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <StatusPill value={run.status} />
                        <span className="text-xs text-slate-500">{new Date(run.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="font-medium text-ink">{outcome?.title || run.outcomeSnapshot.title}</p>
                      <div className="mt-3 grid gap-2 text-sm text-slateText sm:grid-cols-2">
                        <span>Target: {run.targetAgent}</span>
                        <span>{summarizeVerificationResults(run.verificationResults)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No agent runs yet" detail="Prepare a handoff from an outcome or prompt to create the first agent run." />
            )}
          </PanelBody>
        </Panel>
      </div>

      <div className="flex flex-col gap-5">
        {selectedRun && handoff ? (
          <>
            <Panel>
              <PanelBody>
                <SectionHeader
                  title="Handoff Package"
                  eyebrow={selectedOutcome?.title || selectedRun.outcomeSnapshot.title}
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => onCopy(`full-${selectedRun.id}`, handoff.fullHandoff)}>
                        <Clipboard className="h-4 w-4" />
                        {copiedKey === `full-${selectedRun.id}` ? "Copied" : "Copy full"}
                      </Button>
                      <Button onClick={() => onDownload("prompt.md", handoff.promptMarkdown, "text/markdown")}>
                        <Download className="h-4 w-4" />
                        prompt.md
                      </Button>
                    </div>
                  }
                />

                <div className="mb-4 grid gap-3 md:grid-cols-2">
                  <CommandPreview
                    title="Codex command preview"
                    value={handoff.codexCommandPreview}
                    copied={copiedKey === `codex-${selectedRun.id}`}
                    onCopy={() => onCopy(`codex-${selectedRun.id}`, handoff.codexCommandPreview)}
                  />
                  <CommandPreview
                    title="Claude Code draft command preview"
                    value={handoff.claudeCommandPreview}
                    copied={copiedKey === `claude-${selectedRun.id}`}
                    onCopy={() => onCopy(`claude-${selectedRun.id}`, handoff.claudeCommandPreview)}
                  />
                </div>
                <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-800">
                  Both command previews use the exported `prompt.md`, which includes the Permission Safety Rules and handoff context.
                </p>

                <div className="mb-4 flex flex-wrap gap-2">
                  <Button onClick={() => onDownload("context.json", handoff.contextJson, "application/json")}>
                    <Download className="h-4 w-4" />
                    context.json
                  </Button>
                  <Button onClick={() => onDownload("verification.json", handoff.verificationJson, "application/json")}>
                    <Download className="h-4 w-4" />
                    verification.json
                  </Button>
                  <Button onClick={() => onIngestResult(selectedRun)}>
                    <FileCode2 className="h-4 w-4" />
                    Ingest Result
                  </Button>
                </div>

                <MonoBlock value={handoff.promptMarkdown} />
              </PanelBody>
            </Panel>

            <DirectCodexPanel
              run={selectedRun}
              project={project}
              selectedCommands={selectedCommands}
              approvalChecked={Boolean(approvalCheckedByRun[selectedRun.id])}
              protectedBranchApprovalChecked={Boolean(protectedBranchApprovalByRun[selectedRun.id])}
              absorbChecks={absorbChecksByRun[selectedRun.id] || { diff: false, memory: false }}
              skippedVerificationReason={skipReasonByRun[selectedRun.id] || ""}
              busy={bridgeBusyId === selectedRun.id}
              isStreaming={streamingRunId === selectedRun.id || selectedRun.status === "RunningCodex"}
              streamStartedAt={streamStartedAtByRun[selectedRun.id] || selectedRun.codexStartedAt || ""}
              liveLog={liveLogsByRun[selectedRun.id]}
              verifying={verifyingRunId === selectedRun.id}
              bridgeError={bridgeError}
              onApprovalChange={(checked) =>
                setApprovalCheckedByRun((current) => ({ ...current, [selectedRun.id]: checked }))
              }
              onProtectedBranchApprovalChange={(checked) =>
                setProtectedBranchApprovalByRun((current) => ({ ...current, [selectedRun.id]: checked }))
              }
              onAbsorbChecksChange={(checks) =>
                setAbsorbChecksByRun((current) => ({ ...current, [selectedRun.id]: checks }))
              }
              onSkippedVerificationReasonChange={(reason) =>
                setSkipReasonByRun((current) => ({ ...current, [selectedRun.id]: reason }))
              }
              onCheckCodex={() => onCheckCodex(selectedRun)}
              onPrepareDiskPackage={() => onPrepareDiskPackage(selectedRun)}
              onGitPreflight={() => onGitPreflight(selectedRun)}
              onRunCodex={() =>
                onRunCodex(selectedRun, {
                  protectedBranchConfirmed: Boolean(protectedBranchApprovalByRun[selectedRun.id]),
                })
              }
              onCancelRun={() => onCancelRun(selectedRun)}
              onLoadLogs={() => onLoadLogs(selectedRun)}
              onMarkDiffReviewed={() => onMarkDiffReviewed(selectedRun)}
              onRunVerification={() => onRunVerification(selectedRun, selectedCommands)}
              onIngestCodexResult={() => onIngestResult(selectedRun)}
              onAbsorbResult={() => onAbsorbResult(selectedRun, skipReasonByRun[selectedRun.id] || "")}
            />

            <Panel>
              <PanelBody>
                <SectionHeader
                  title="Verification Runner"
                  eyebrow="Allowlisted commands"
                  action={
                    <Button
                      variant="primary"
                      disabled={!selectedCommands.length || verifyingRunId === selectedRun.id}
                      onClick={() => onRunVerification(selectedRun, selectedCommands)}
                    >
                      <Play className="h-4 w-4" />
                      {verifyingRunId === selectedRun.id ? "Running" : "Run Verification"}
                    </Button>
                  }
                />
                <div className="space-y-3">
                  {selectedRun.verificationCommands.map((command, index) => (
                    <label key={`verification-command-${selectedRun.id}-${index}-${command}`} className="flex items-center gap-3 rounded-lg border border-line bg-white p-3 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-line text-electric"
                        checked={selectedCommands.includes(command)}
                        onChange={(event) => onToggleCommand(command, event.target.checked)}
                      />
                      <code className="font-mono text-xs">{command}</code>
                      {!allowedVerificationCommands.includes(command as (typeof allowedVerificationCommands)[number]) ? (
                        <span className="ml-auto rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                          blocked
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>

                {verificationError ? (
                  <div className="mt-4 flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{verificationError}</p>
                  </div>
                ) : null}

                <div className="mt-5 rounded-lg border border-line bg-white p-4">
                  <p className="mb-3 font-medium text-ink">{summarizeVerificationResults(selectedRun.verificationResults)}</p>
                  {selectedRun.verificationResults.length ? (
                    <div className="space-y-3">
                      {selectedRun.verificationResults.map((result, index) => (
                        <details key={`verification-result-${selectedRun.id}-${index}-${result.command}`} className="rounded-lg border border-line bg-mist p-3">
                          <summary className="cursor-pointer text-sm font-medium text-ink">
                            <span className="mr-2 inline-flex items-center gap-1">
                              {result.status === "passed" ? (
                                <CheckCircle2 className="inline h-4 w-4 text-emerald-600" />
                              ) : (
                                <AlertTriangle className="inline h-4 w-4 text-rose-600" />
                              )}
                              {result.command}
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              exit {result.exitCode}, {result.durationMs}ms
                            </span>
                          </summary>
                          <ResultBlock title="stdout" value={result.stdout} />
                          <ResultBlock title="stderr" value={result.stderr} />
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No verification run yet.</p>
                  )}
                </div>
              </PanelBody>
            </Panel>
          </>
        ) : (
          <Panel>
            <PanelBody>
              <EmptyState title="Select or prepare a run" detail="Agent runs capture the prompt, context, outcome, and verification state for one handoff." />
            </PanelBody>
          </Panel>
        )}
      </div>
    </div>
  );
}

function DirectCodexPanel({
  run,
  project,
  selectedCommands,
  approvalChecked,
  protectedBranchApprovalChecked,
  absorbChecks,
  skippedVerificationReason,
  busy,
  isStreaming,
  streamStartedAt,
  liveLog,
  verifying,
  bridgeError,
  onApprovalChange,
  onProtectedBranchApprovalChange,
  onAbsorbChecksChange,
  onSkippedVerificationReasonChange,
  onCheckCodex,
  onPrepareDiskPackage,
  onGitPreflight,
  onRunCodex,
  onCancelRun,
  onLoadLogs,
  onMarkDiffReviewed,
  onRunVerification,
  onIngestCodexResult,
  onAbsorbResult,
}: {
  run: AgentRun;
  project: Project;
  selectedCommands: string[];
  approvalChecked: boolean;
  protectedBranchApprovalChecked: boolean;
  absorbChecks: { diff: boolean; memory: boolean };
  skippedVerificationReason: string;
  busy: boolean;
  isStreaming: boolean;
  streamStartedAt: string;
  liveLog?: { stdout: string; stderr: string; events: CodexRunEvent[]; message?: string };
  verifying: boolean;
  bridgeError: string;
  onApprovalChange: (checked: boolean) => void;
  onProtectedBranchApprovalChange: (checked: boolean) => void;
  onAbsorbChecksChange: (checks: { diff: boolean; memory: boolean }) => void;
  onSkippedVerificationReasonChange: (reason: string) => void;
  onCheckCodex: () => void;
  onPrepareDiskPackage: () => void;
  onGitPreflight: () => void;
  onRunCodex: () => void;
  onCancelRun: () => void;
  onLoadLogs: () => void;
  onMarkDiffReviewed: () => void;
  onRunVerification: () => void;
  onIngestCodexResult: () => void;
  onAbsorbResult: () => void;
}) {
  const [tick, setTick] = useState(0);
  const readiness = buildExecutionReadiness(project, run);
  const failures = criticalReadinessFailures(readiness);
  const protectedBranch = isProtectedBranch(run.gitBranch);
  const verificationNeedsReason = requiresVerificationSkippedReason(run);
  const liveStdout = liveLog?.stdout || run.codexStdout;
  const liveStderr = liveLog?.stderr || run.codexStderr;
  const liveEvents = liveLog?.events || [];
  const elapsedMs =
    isStreaming && streamStartedAt
      ? Date.now() - new Date(streamStartedAt).getTime() + tick * 0
      : run.codexDurationMs || 0;
  const canRun =
    readinessAllowsRun(readiness) &&
    approvalChecked &&
    (!protectedBranch || protectedBranchApprovalChecked) &&
    run.status !== "RunningCodex" &&
    !isStreaming &&
    !busy;
  const canAbsorb =
    (!run.requiresDiffReview || Boolean(run.diffReviewedAt)) &&
    canAbsorbWithConfirmation({
      diffReviewed: absorbChecks.diff,
      understandsAbsorb: absorbChecks.memory,
      verificationPassed: !verificationNeedsReason,
      skippedVerificationReason,
    });

  useEffect(() => {
    if (!isStreaming) return;
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isStreaming]);

  return (
    <Panel>
      <PanelBody>
        <SectionHeader title="Direct Codex Bridge" eyebrow="Explicit approval required" />
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            "1. Check Codex",
            "2. Prepare disk package",
            "3. Git preflight",
            "4. Approve and run",
            "5. Review diff",
            "6. Run verification",
            "7. Ingest result",
            "8. Absorb after review",
          ].map((step, index) => (
            <div key={`codex-bridge-step-${index}-${step}`} className="rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-slateText">
              {step}
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <p className="font-medium">v3 streams Codex logs only after explicit approval.</p>
          <p>No auto-commit, no deploy, no push. Live stdout/stderr are persisted to disk, and diff review is still required before absorb.</p>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <StateLine label="Codex" value={run.codexAvailable === null ? "Not checked" : run.codexAvailable ? "Available" : "Unavailable"} />
          <StateLine label="Approval" value={run.approvalState} />
          <StateLine label="Diff review" value={run.requiresDiffReview ? (run.diffReviewedAt ? "Reviewed" : "Required") : "Not required yet"} />
          <StateLine label="Elapsed" value={elapsedMs ? `${Math.max(0, Math.round(elapsedMs / 1000))}s` : "Not run"} />
        </div>

        <div className="mb-4 rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>Execution Readiness Checklist</FieldLabel>
            <span className={cx("rounded-md border px-2 py-1 text-xs font-medium", failures.length ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
              {failures.length ? `${failures.length} blocking` : "Ready when approved"}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {readiness.map((item) => (
              <ReadinessRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-white p-4">
            <FieldLabel>Approval card</FieldLabel>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slateText">
              <p>
                Exact command preview:
                <code className="mt-2 block rounded-md bg-slate-100 p-3 font-mono text-xs text-slate-700">
                  {run.codexCommandPreview}
                </code>
              </p>
              <p>Selected repo path: <span className="font-mono text-xs">{project.repoPathOrUrl || "Not set"}</span></p>
              <p>Permission Safety Rules are included in `prompt.md`; Codex must stay inside this folder and stop on risky actions.</p>
              <p className="font-medium text-amber-900">Warning: no auto-commit, no deploy, and diff review is required.</p>
              <label className="flex items-start gap-3 rounded-md border border-line bg-mist p-3 text-ink">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-line text-electric"
                  checked={approvalChecked}
                  onChange={(event) => onApprovalChange(event.target.checked)}
                />
                <span>I approve running Codex in this project folder only.</span>
              </label>
              {protectedBranch ? (
                <label className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-900">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-rose-200 text-rose-600"
                    checked={protectedBranchApprovalChecked}
                    onChange={(event) => onProtectedBranchApprovalChange(event.target.checked)}
                  />
                  <span>I understand this will run on master/main.</span>
                </label>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4">
            <FieldLabel>Bridge actions</FieldLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={onCheckCodex} disabled={busy}>
                <TerminalSquare className="h-4 w-4" />
                Check Codex
              </Button>
              <Button onClick={onPrepareDiskPackage} disabled={busy}>
                <Download className="h-4 w-4" />
                Prepare Disk Package
              </Button>
              <Button onClick={onGitPreflight} disabled={busy}>
                <ShieldCheck className="h-4 w-4" />
                Run Git Preflight
              </Button>
              <Button variant="primary" onClick={onRunCodex} disabled={!canRun}>
                <Play className="h-4 w-4" />
                {isStreaming ? "Streaming Codex" : "Approve & Run Codex"}
              </Button>
              <Button variant="danger" onClick={onCancelRun} disabled={!isStreaming}>
                <AlertTriangle className="h-4 w-4" />
                Cancel Run
              </Button>
              <Button onClick={onLoadLogs} disabled={busy}>
                <TerminalSquare className="h-4 w-4" />
                Load Persisted Logs
              </Button>
              <Button onClick={onMarkDiffReviewed} disabled={!run.requiresDiffReview || Boolean(run.diffReviewedAt)}>
                <CheckCircle2 className="h-4 w-4" />
                Mark Diff Reviewed
              </Button>
              <Button onClick={onRunVerification} disabled={!selectedCommands.length || verifying}>
                <Play className="h-4 w-4" />
                Run Verification
              </Button>
              <Button onClick={onIngestCodexResult} disabled={!run.codexStdout && !run.codexStderr && !run.gitDiffStat}>
                <FileCode2 className="h-4 w-4" />
                Ingest Codex Result
              </Button>
              <Button variant="primary" onClick={onAbsorbResult} disabled={!canAbsorb || (!run.codexStdout && !run.codexStderr && !run.gitDiffStat)}>
                <CheckCircle2 className="h-4 w-4" />
                Absorb Result into Memory
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-line bg-white p-4">
          <FieldLabel>Absorb confirmation</FieldLabel>
          <div className="mt-3 space-y-3 text-sm text-slateText">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-line text-electric"
                checked={absorbChecks.diff}
                onChange={(event) => onAbsorbChecksChange({ ...absorbChecks, diff: event.target.checked })}
              />
              <span>I reviewed the diff.</span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-line text-electric"
                checked={absorbChecks.memory}
                onChange={(event) => onAbsorbChecksChange({ ...absorbChecks, memory: event.target.checked })}
              />
              <span>I understand Brainpress will update memory/build logs.</span>
            </label>
            {verificationNeedsReason ? (
              <div>
                <FieldLabel>Verification skipped reason</FieldLabel>
                <textarea
                  className="mt-2 min-h-20 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-electric focus:ring-4 focus:ring-electric/10"
                  value={skippedVerificationReason}
                  placeholder="Explain why you are absorbing without successful verification."
                  onChange={(event) => onSkippedVerificationReasonChange(event.target.value)}
                />
              </div>
            ) : (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">Verification passed for this run.</p>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>Live Codex Logs</FieldLabel>
            <span className={cx("rounded-md border px-2 py-1 text-xs font-medium", isStreaming ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600")}>
              {isStreaming ? "Streaming" : liveEvents.length ? "Loaded" : "Idle"}
            </span>
          </div>
          {liveLog?.message ? <p className="mb-3 text-sm leading-6 text-slateText">{liveLog.message}</p> : null}
          <div className="grid gap-3 lg:grid-cols-2">
            <LogBlock title="stdout.log" value={liveStdout} />
            <LogBlock title="stderr.log" value={liveStderr} />
          </div>
          <div className="mt-3 rounded-lg border border-line bg-mist p-3">
            <p className="mb-2 text-xs font-medium uppercase text-slate-500">Event timeline</p>
            {liveEvents.length ? (
              <div className="max-h-52 space-y-2 overflow-auto">
                {liveEvents.slice(-30).map((event, index) => (
                  <div key={`${event.timestamp}-${event.type}-${index}`} className="grid gap-2 rounded-md bg-white px-3 py-2 text-xs text-slateText sm:grid-cols-[150px_170px_1fr]">
                    <span className="font-mono text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    <span className="font-mono font-semibold text-ink">{event.type}</span>
                    <span className="truncate font-mono">
                      {typeof event.payload.text === "string"
                        ? event.payload.text.trim().slice(0, 120) || "(chunk)"
                        : event.payload.failureReason
                          ? String(event.payload.failureReason)
                          : event.payload.status
                            ? String(event.payload.status)
                            : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No streamed events yet. Start Codex or load persisted logs.</p>
            )}
          </div>
        </div>

        {run.status === "Cancelled" || run.status === "TimedOut" ? (
          <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-900">
            <p className="font-medium">Interrupted run requires extra care.</p>
            <p>
              Brainpress preserved partial logs. Do not absorb until you manually review the files and explain why verification was skipped or incomplete.
            </p>
          </div>
        ) : null}

        {bridgeError || run.failureReason ? (
          <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{bridgeError || run.failureReason}</p>
          </div>
        ) : null}

        {run.gitDiffStat || run.gitDiffTextPreview ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <p className="font-medium">Review the actual files in your editor before absorbing.</p>
              <p>
                Diff preview length: {run.gitDiffPreviewLength || run.gitDiffTextPreview.length} characters
                {run.gitDiffPreviewTruncated ? " (truncated)" : " (not truncated)"}.
              </p>
              {run.changedFilesSummary.length ? (
                <p className="mt-2 font-mono text-xs">{run.changedFilesSummary.join(", ")}</p>
              ) : null}
            </div>
            <details className="rounded-lg border border-line bg-white p-4" open>
              <summary className="cursor-pointer text-sm font-medium text-ink">Git diff stat</summary>
              <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
                {run.gitDiffStat || "(empty)"}
              </pre>
            </details>
            <details className="rounded-lg border border-line bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink">Diff preview</summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
                {run.gitDiffTextPreview || "(empty)"}
              </pre>
            </details>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

function StateLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function ReadinessRow({ item }: { item: ReadinessItem }) {
  const tone =
    item.state === "passed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : item.state === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-rose-200 bg-rose-50 text-rose-800";
  const label = item.state === "passed" ? "passed" : item.state === "warning" ? "warning" : "failed";

  return (
    <div className={cx("rounded-md border p-3", tone)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{item.label}</p>
        <span className="rounded-md bg-white/70 px-2 py-0.5 text-xs font-semibold">{label}</span>
      </div>
      <p className="text-xs leading-5">{item.detail}</p>
    </div>
  );
}

function CommandPreview({
  title,
  value,
  copied,
  onCopy,
}: {
  title: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <FieldLabel>{title}</FieldLabel>
        <Button variant="ghost" onClick={onCopy}>
          <Clipboard className="h-4 w-4" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <code className="block rounded-md bg-slate-100 p-3 font-mono text-xs leading-5 text-slate-700">{value}</code>
    </div>
  );
}

function ResultBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        <TerminalSquare className="h-3.5 w-3.5" />
        {title}
      </div>
      <pre className="max-h-56 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
        {value || "(empty)"}
      </pre>
    </div>
  );
}

function LogBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        <TerminalSquare className="h-3.5 w-3.5" />
        {title}
      </div>
      <pre className="h-64 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
        {value || "(empty)"}
      </pre>
    </div>
  );
}
