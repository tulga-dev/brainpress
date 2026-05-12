import { NextResponse } from "next/server";
import { localCodexBridgeAdapterFromServerEnv } from "@/lib/coding-agent-adapter";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const adapter = localCodexBridgeAdapterFromServerEnv();
  const status = await adapter.getTaskStatusDetail(runId);
  return NextResponse.json(status, { status: status.configured ? 200 : 503 });
}
