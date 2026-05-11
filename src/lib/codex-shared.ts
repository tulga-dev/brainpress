export const codexSandbox = "workspace-write";
export const codexAskForApproval = "on-request";

export function buildCodexCommandPreview(runId: string) {
  return `codex exec --sandbox ${codexSandbox} --ask-for-approval ${codexAskForApproval} < .brainpress/runs/${runId}/prompt.md`;
}
