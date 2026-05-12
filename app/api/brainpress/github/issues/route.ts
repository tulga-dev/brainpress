import { NextResponse } from "next/server";
import { createGithubIssueBody, createGithubIssueTitle, inferGithubRepository } from "@/lib/github-dispatch";
import type { DevelopmentTask, Project } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    task?: DevelopmentTask;
    project?: Project;
    repository?: string;
  };
  const task = body.task;
  const project = body.project;
  if (!task || !project) {
    return NextResponse.json({ configured: false, message: "Missing Brainpress task or project." }, { status: 400 });
  }

  const token = process.env.BRAINPRESS_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({
      configured: false,
      message: "GitHub issue creation is not configured. Copy the issue body and create it manually.",
    });
  }

  const repository = body.repository || inferGithubRepository(task.repo || project.repoPathOrUrl);
  if (!repository) {
    return NextResponse.json(
      {
        configured: true,
        message: "Add a GitHub repository in owner/name format before creating the issue.",
      },
      { status: 400 },
    );
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      title: createGithubIssueTitle(task),
      body: createGithubIssueBody(task, project),
      labels: ["brainpress", task.taskType],
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    html_url?: string;
    number?: number;
    message?: string;
  };

  if (!response.ok || !payload.html_url) {
    return NextResponse.json(
      {
        configured: true,
        message: payload.message || `GitHub rejected the issue request with HTTP ${response.status}.`,
      },
      { status: response.ok ? 502 : response.status },
    );
  }

  return NextResponse.json({
    configured: true,
    issueUrl: payload.html_url,
    issueNumber: payload.number,
    message: "GitHub issue created.",
  });
}
