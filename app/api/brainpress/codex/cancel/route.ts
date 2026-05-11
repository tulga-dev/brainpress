import { NextResponse } from "next/server";
import { validateLocalProjectPath } from "@/lib/codex-bridge";
import { cancelActiveCodexRun } from "@/lib/server-run-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CancelRunRequest {
  repoPath?: string;
  runId?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CancelRunRequest;
  const repoPath = body.repoPath?.trim() || "";
  const runId = body.runId?.trim() || "";

  const localValidation = validateLocalProjectPath(repoPath);
  if (!localValidation.ok) return NextResponse.json({ error: localValidation.error }, { status: 400 });
  if (!runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });

  const result = await cancelActiveCodexRun(runId);
  return NextResponse.json(result, { status: 200 });
}
