import { NextResponse } from "next/server";
import { localCodexBridgeAdapterFromServerEnv } from "@/lib/coding-agent-adapter";

export async function GET() {
  const adapter = localCodexBridgeAdapterFromServerEnv();
  const health = await adapter.checkHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
