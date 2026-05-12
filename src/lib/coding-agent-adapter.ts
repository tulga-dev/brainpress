import type { DevelopmentTask } from "@/lib/types";

export type CodingAgentRunStatus = "not_configured" | "queued" | "running" | "completed" | "failed" | "cancelled";
export const defaultLocalCodexBridgeUrl = "http://localhost:4317";

export interface CodingAgentRun {
  runId: string;
  status: CodingAgentRunStatus;
  message: string;
  externalRunUrl?: string;
  configured: boolean;
}

export interface LocalCodexBridgeHealth {
  ok: boolean;
  name?: string;
  version?: string;
  url: string;
  message: string;
}

export interface CodingAgentResult {
  runId: string;
  status: CodingAgentRunStatus;
  summary: string;
  raw: string;
  prUrl?: string;
}

export interface CodingAgentAdapter {
  createTask(task: DevelopmentTask): Promise<CodingAgentRun>;
  getTaskStatus(runId: string): Promise<CodingAgentRunStatus>;
  getTaskResult(runId: string): Promise<CodingAgentResult>;
}

export interface CodexAdapterOptions {
  codexCloudConfigured?: boolean;
  codexCliBridgeConfigured?: boolean;
}

export interface LocalCodexBridgeAdapterOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class CodexAdapter implements CodingAgentAdapter {
  private readonly codexCloudConfigured: boolean;
  private readonly codexCliBridgeConfigured: boolean;

  constructor(options: CodexAdapterOptions = {}) {
    this.codexCloudConfigured = Boolean(options.codexCloudConfigured);
    this.codexCliBridgeConfigured = Boolean(options.codexCliBridgeConfigured);
  }

  async createTask(task: DevelopmentTask): Promise<CodingAgentRun> {
    if (task.dispatchTarget === "codex_cloud" && this.codexCloudConfigured) {
      return {
        runId: `codex_cloud_placeholder_${task.id}`,
        status: "queued",
        message: "Codex Cloud adapter boundary reached. Real Codex Cloud API dispatch is intentionally TODO.",
        configured: true,
      };
    }

    if (task.dispatchTarget === "codex_cli" && this.codexCliBridgeConfigured) {
      return {
        runId: `codex_cli_placeholder_${task.id}`,
        status: "queued",
        message: "Codex CLI bridge boundary reached. Real local bridge dispatch is intentionally TODO.",
        configured: true,
      };
    }

    return {
      runId: "",
      status: "not_configured",
      message:
        "Codex dispatch not configured yet. Brainpress saved the structured task, but did not send it to Codex. Configure the future Codex Cloud or local CLI bridge to enable direct dispatch.",
      configured: false,
    };
  }

  async getTaskStatus(_runId: string): Promise<CodingAgentRunStatus> {
    return "not_configured";
  }

  async getTaskResult(runId: string): Promise<CodingAgentResult> {
    return {
      runId,
      status: "not_configured",
      summary: "Codex result retrieval is not configured yet.",
      raw: "",
    };
  }
}

export class LocalCodexBridgeAdapter implements CodingAgentAdapter {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: LocalCodexBridgeAdapterOptions = {}) {
    this.baseUrl = normalizeBridgeUrl(options.baseUrl || process.env.BRAINPRESS_LOCAL_CODEX_BRIDGE_URL || defaultLocalCodexBridgeUrl);
    this.fetcher = options.fetcher || fetch;
  }

  async checkHealth(): Promise<LocalCodexBridgeHealth> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/health`, { method: "GET" });
      if (!response.ok) {
        return {
          ok: false,
          url: this.baseUrl,
          message: `Local Codex Bridge is not running. Health check returned HTTP ${response.status}.`,
        };
      }
      const payload = await response.json().catch(() => ({})) as Partial<LocalCodexBridgeHealth>;
      if (!payload.ok) {
        return {
          ok: false,
          url: this.baseUrl,
          message: "Local Codex Bridge is not running.",
        };
      }
      return {
        ok: true,
        name: payload.name || "Brainpress Local Codex Bridge",
        version: payload.version || "unknown",
        url: this.baseUrl,
        message: "Local Codex Bridge is available.",
      };
    } catch {
      return {
        ok: false,
        url: this.baseUrl,
        message: "Local Codex Bridge is not running.",
      };
    }
  }

  async createTask(task: DevelopmentTask): Promise<CodingAgentRun> {
    const health = await this.checkHealth();
    if (!health.ok) {
      return {
        runId: "",
        status: "not_configured",
        message: health.message,
        configured: false,
      };
    }

    try {
      const response = await this.fetcher(`${this.baseUrl}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          repo: task.repo,
          branch: task.branch,
          mode: "local_bridge",
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        runId?: string;
        status?: CodingAgentRunStatus;
        externalRunUrl?: string;
        message?: string;
      };

      if (!response.ok || !payload.runId) {
        return {
          runId: "",
          status: "failed",
          message: payload.message || `Local Codex Bridge rejected the task with HTTP ${response.status}.`,
          configured: true,
        };
      }

      return {
        runId: payload.runId,
        status: normalizeRunStatus(payload.status || "queued"),
        externalRunUrl: payload.externalRunUrl || `${this.baseUrl}/tasks/${payload.runId}`,
        message: payload.message || "Task sent to Local Codex Bridge.",
        configured: true,
      };
    } catch {
      return {
        runId: "",
        status: "not_configured",
        message: "Local Codex Bridge is not running.",
        configured: false,
      };
    }
  }

  async getTaskStatus(runId: string): Promise<CodingAgentRunStatus> {
    const detail = await this.getTaskStatusDetail(runId);
    return detail.status;
  }

  async getTaskStatusDetail(runId: string): Promise<CodingAgentRun> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/tasks/${encodeURIComponent(runId)}`, { method: "GET" });
      const payload = await response.json().catch(() => ({})) as {
        runId?: string;
        status?: CodingAgentRunStatus;
        externalRunUrl?: string;
        message?: string;
      };

      if (!response.ok) {
        return {
          runId,
          status: "failed",
          message: payload.message || `Local bridge status check failed with HTTP ${response.status}.`,
          configured: true,
        };
      }

      return {
        runId: payload.runId || runId,
        status: normalizeRunStatus(payload.status || "queued"),
        externalRunUrl: payload.externalRunUrl,
        message: payload.message || "Local bridge status loaded.",
        configured: true,
      };
    } catch {
      return {
        runId,
        status: "not_configured",
        message: "Local Codex Bridge is not running.",
        configured: false,
      };
    }
  }

  async getTaskResult(runId: string): Promise<CodingAgentResult> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/tasks/${encodeURIComponent(runId)}/result`, { method: "GET" });
      const payload = await response.json().catch(() => ({})) as Partial<CodingAgentResult>;

      if (!response.ok) {
        return {
          runId,
          status: "failed",
          summary: payload.summary || `Local bridge result check failed with HTTP ${response.status}.`,
          raw: payload.raw || "",
          prUrl: payload.prUrl,
        };
      }

      return {
        runId: payload.runId || runId,
        status: normalizeRunStatus(payload.status || "completed"),
        summary: payload.summary || "Local bridge result loaded.",
        raw: payload.raw || "",
        prUrl: payload.prUrl,
      };
    } catch {
      return {
        runId,
        status: "not_configured",
        summary: "Local Codex Bridge is not running.",
        raw: "",
      };
    }
  }
}

export function codexAdapterFromServerEnv(env: NodeJS.ProcessEnv = process.env) {
  return new CodexAdapter({
    codexCloudConfigured: Boolean(env.CODEX_CLOUD_API_KEY || env.CODEX_API_KEY),
    codexCliBridgeConfigured: env.BRAINPRESS_CODEX_CLI_BRIDGE_ENABLED === "true",
  });
}

export function localCodexBridgeAdapterFromServerEnv(env: NodeJS.ProcessEnv = process.env) {
  return new LocalCodexBridgeAdapter({
    baseUrl: env.BRAINPRESS_LOCAL_CODEX_BRIDGE_URL || defaultLocalCodexBridgeUrl,
  });
}

function normalizeBridgeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeRunStatus(status: string): CodingAgentRunStatus {
  if (["queued", "running", "completed", "failed", "cancelled", "not_configured"].includes(status)) {
    return status as CodingAgentRunStatus;
  }
  return "failed";
}
