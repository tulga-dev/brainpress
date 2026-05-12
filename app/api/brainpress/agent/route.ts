import { NextResponse } from "next/server";
import { normalizeAgentResponse, type BrainpressAgentRequest } from "@/lib/agent-gateway";
import { runBrainpressAgent } from "@/lib/server/agent-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: BrainpressAgentRequest;

  try {
    body = (await request.json()) as BrainpressAgentRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.project || !body.input?.trim() || !["think", "build", "run"].includes(body.surface)) {
    return NextResponse.json({ ok: false, error: "surface, input, and project are required." }, { status: 400 });
  }

  const response = await runBrainpressAgent(body);
  const normalized = normalizeAgentResponse(body.surface, response);

  return NextResponse.json(normalized || response);
}
