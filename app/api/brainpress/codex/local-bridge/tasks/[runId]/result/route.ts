import { NextResponse } from "next/server";
import { localCodexBridgeAdapterFromServerEnv } from "@/lib/coding-agent-adapter";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const adapter = localCodexBridgeAdapterFromServerEnv();
  const result = await adapter.getTaskResult(runId);
  return NextResponse.json(result, { status: result.status === "not_configured" ? 503 : 200 });
}
