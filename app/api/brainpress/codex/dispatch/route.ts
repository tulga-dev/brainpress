import { NextResponse } from "next/server";
import { codexAdapterFromServerEnv, localCodexBridgeAdapterFromServerEnv } from "@/lib/coding-agent-adapter";
import { normalizeDevelopmentTask } from "@/lib/development-tasks";
import type { DevelopmentTask } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { task?: unknown };
    if (!payload.task || typeof payload.task !== "object") {
      return NextResponse.json({ error: "Missing development task." }, { status: 400 });
    }

    const task = normalizeDevelopmentTask(payload.task as Partial<DevelopmentTask>);
    if (!["codex_cloud", "codex_cli"].includes(task.dispatchTarget)) {
      return NextResponse.json({
        configured: false,
        message: "This task is not targeted at Codex. Choose Codex Cloud or Codex CLI before dispatch.",
      });
    }

    const adapter =
      task.dispatchTarget === "codex_cli" && task.dispatchMode === "local_bridge"
        ? localCodexBridgeAdapterFromServerEnv()
        : codexAdapterFromServerEnv();
    const run = await adapter.createTask(task);

    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json(
      {
        configured: false,
        message: error instanceof Error ? error.message : "Codex dispatch failed before a run could be created.",
      },
      { status: 500 },
    );
  }
}
