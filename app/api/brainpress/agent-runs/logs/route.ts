import { NextResponse } from "next/server";
import { validateLocalProjectPath } from "@/lib/codex-bridge";
import { readPersistedRunLogs } from "@/lib/server-run-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoPath = searchParams.get("repoPath")?.trim() || "";
  const runId = searchParams.get("runId")?.trim() || "";

  const localValidation = validateLocalProjectPath(repoPath);
  if (!localValidation.ok) return NextResponse.json({ error: localValidation.error }, { status: 400 });
  if (!runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });

  const logs = await readPersistedRunLogs(repoPath, runId);
  return NextResponse.json(logs);
}
