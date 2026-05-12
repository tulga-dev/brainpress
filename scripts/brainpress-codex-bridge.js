#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const host = "127.0.0.1";
const port = Number(process.env.BRAINPRESS_LOCAL_CODEX_BRIDGE_PORT || 4317);
const bridgeName = "Brainpress Local Codex Bridge";
const version = "0.1.0";

const tasks = new Map();

const server = http.createServer(async (request, response) => {
  try {
    setJsonHeaders(response);
    const url = new URL(request.url || "/", `http://${host}:${port}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { ok: true, name: bridgeName, version });
    }

    if (request.method === "POST" && url.pathname === "/tasks") {
      const payload = await readJson(request);
      return handleCreateTask(response, payload);
    }

    const resultMatch = url.pathname.match(/^\/tasks\/([^/]+)\/result$/);
    if (request.method === "GET" && resultMatch) {
      return handleTaskResult(response, decodeURIComponent(resultMatch[1]));
    }

    const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
    if (request.method === "GET" && taskMatch) {
      return handleTaskStatus(response, decodeURIComponent(taskMatch[1]));
    }

    return sendJson(response, 404, { message: "Not found." });
  } catch (error) {
    return sendJson(response, 500, { message: error instanceof Error ? error.message : "Bridge error." });
  }
});

server.listen(port, host, () => {
  console.log(`${bridgeName} ${version} listening on http://${host}:${port}`);
  console.log("This reference bridge packages tasks only. It does not invoke Codex CLI.");
});

function handleCreateTask(response, payload) {
  const task = payload && payload.task;
  const repo = typeof payload?.repo === "string" ? payload.repo : task?.repo;
  const branch = typeof payload?.branch === "string" ? payload.branch : task?.branch || "";

  if (!task || typeof task !== "object") {
    return sendJson(response, 400, { message: "Missing DevelopmentTask." });
  }
  if (!repo || /^https?:\/\//i.test(repo)) {
    return sendJson(response, 400, { message: "Repo must be a local filesystem path for the local bridge." });
  }

  const repoPath = path.resolve(repo);
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    return sendJson(response, 400, { message: `Repo path does not exist: ${repoPath}` });
  }

  const taskId = sanitizeSegment(task.id || `task_${Date.now()}`);
  const runId = `local_${taskId}_${Date.now().toString(36)}`;
  const taskDir = safeJoin(repoPath, ".brainpress", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });

  const createdAt = new Date().toISOString();
  const status = {
    runId,
    taskId,
    status: "queued",
    repo: repoPath,
    branch,
    mode: "local_bridge",
    message: "Task packaged for local Codex bridge. Codex CLI execution is not enabled in this reference bridge.",
    createdAt,
    updatedAt: createdAt,
  };

  fs.writeFileSync(path.join(taskDir, "task.json"), JSON.stringify({ task, repo: repoPath, branch, mode: "local_bridge" }, null, 2));
  fs.writeFileSync(path.join(taskDir, "task.md"), taskMarkdown(task, status));
  fs.writeFileSync(path.join(taskDir, "status.json"), JSON.stringify(status, null, 2));
  fs.writeFileSync(
    path.join(taskDir, "result.md"),
    [
      "# Local Codex Bridge Result",
      "",
      "No Codex CLI execution has run yet.",
      "This placeholder exists so Brainpress can poll/import a result shape safely.",
      "",
      "Future bridge versions may write Codex output here after explicit user approval.",
    ].join("\n"),
  );

  tasks.set(runId, { status, taskDir });

  return sendJson(response, 200, {
    runId,
    status: status.status,
    externalRunUrl: `http://${host}:${port}/tasks/${encodeURIComponent(runId)}`,
    message: status.message,
  });
}

function handleTaskStatus(response, runId) {
  const record = findTask(runId);
  if (!record) return sendJson(response, 404, { runId, status: "failed", message: "Local bridge task was not found." });
  const status = readStatus(record);
  return sendJson(response, 200, {
    runId: status.runId,
    status: status.status,
    externalRunUrl: `http://${host}:${port}/tasks/${encodeURIComponent(status.runId)}`,
    message: status.message,
  });
}

function handleTaskResult(response, runId) {
  const record = findTask(runId);
  if (!record) return sendJson(response, 404, { runId, status: "failed", summary: "Local bridge task was not found.", raw: "" });
  const status = readStatus(record);
  const resultPath = path.join(record.taskDir, "result.md");
  const raw = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, "utf8") : "";
  return sendJson(response, 200, {
    runId: status.runId,
    status: status.status,
    summary: status.message,
    raw,
  });
}

function findTask(runId) {
  if (tasks.has(runId)) return tasks.get(runId);
  return null;
}

function readStatus(record) {
  const statusPath = path.join(record.taskDir, "status.json");
  return JSON.parse(fs.readFileSync(statusPath, "utf8"));
}

function taskMarkdown(task, status) {
  return [
    `# ${task.title || "Development Task"}`,
    "",
    `Run ID: ${status.runId}`,
    `Status: ${status.status}`,
    `Repo: ${status.repo}`,
    status.branch ? `Branch: ${status.branch}` : "",
    "",
    "## Codex Goal",
    "",
    task.codexGoal || "No Codex goal was provided.",
    "",
    "## Description",
    "",
    task.description || "",
    "",
    listSection("Context", task.context),
    listSection("Affected Areas", task.affectedAreas),
    listSection("Acceptance Criteria", task.acceptanceCriteria),
    listSection("Verification Commands", task.verificationCommands),
    listSection("Manual QA Steps", task.manualQaSteps),
    listSection("Constraints", task.constraints),
  ].filter(Boolean).join("\n");
}

function listSection(title, items) {
  if (!Array.isArray(items) || !items.length) return "";
  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""].join("\n");
}

function safeJoin(root, ...parts) {
  const target = path.resolve(root, ...parts);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Refusing to write outside the selected repo path.");
  }
  return target;
}

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 96) || `task_${Date.now()}`;
}

function setJsonHeaders(response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode);
  response.end(JSON.stringify(payload, null, 2));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        request.destroy();
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}
