"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BrainCircuit, ClipboardList, FileText, Plus, RotateCcw, Sparkles } from "lucide-react";
import { agentReadiness, memoryCompleteness, verificationReadiness } from "@/lib/brainpress";
import { createBlankProject } from "@/lib/projects";
import type { Memory, Project } from "@/lib/types";
import { useBrainpress } from "@/components/brainpress/use-brainpress";
import { Button, EmptyState, Metric, Panel, PanelBody, SectionHeader, StatusPill } from "@/components/brainpress/ui";

function emptyMemory(projectId: string): Memory {
  return {
    projectId,
    productSummary: "",
    vision: "",
    targetUsers: "",
    currentBuildState: "",
    technicalArchitecture: "",
    activeDecisions: "",
    deprecatedIdeas: "",
    completedWork: "",
    openQuestions: "",
    knownIssues: "",
    roadmap: "",
  };
}

export function Dashboard() {
  const router = useRouter();
  const { state, setState, reset } = useBrainpress();
  const recentOutcomes = [...state.outcomes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const recentBuildLogs = [...state.buildLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);

  function createProject() {
    const nextProject: Project = createBlankProject();
    const id = nextProject.id;

    setState((current) => ({
      ...current,
      projects: [nextProject, ...current.projects],
      memories: {
        ...current.memories,
        [id]: emptyMemory(id),
      },
    }));
    router.push(`/projects/${id}`);
  }

  return (
    <main className="min-h-screen bg-mist text-ink">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-white">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Brainpress</p>
              <p className="text-xs text-slate-500">Outcome manager for AI builders</p>
            </div>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Reset demo
            </Button>
            <Button variant="primary" onClick={createProject}>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="py-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <Sparkles className="h-4 w-4" />
              Core loop ready
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              Set the outcome. Brainpress manages the agent loop.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slateText">
              Turn messy product memory into verified Codex and Claude Code work.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Projects" value={String(state.projects.length)} detail="Local" />
            <Metric label="Outcomes" value={String(state.outcomes.length)} detail="Tracked" />
            <Metric label="Logs" value={String(state.buildLogs.length)} detail="Ingested" />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <Panel>
            <PanelBody>
              <SectionHeader title="Projects" eyebrow="Workspace" action={<Button onClick={createProject}><Plus className="h-4 w-4" />New Project</Button>} />
              <div className="grid gap-4 md:grid-cols-2">
                {state.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} state={state} />
                ))}
              </div>
            </PanelBody>
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel>
              <PanelBody>
                <SectionHeader title="Recent Outcomes" eyebrow="Execution" />
                <div className="space-y-3">
                  {recentOutcomes.length ? (
                    recentOutcomes.map((outcome) => {
                      const project = state.projects.find((item) => item.id === outcome.projectId);
                      return (
                        <Link
                          href={`/projects/${outcome.projectId}`}
                          key={outcome.id}
                          className="block rounded-lg border border-line bg-white p-4 transition hover:border-electric/40 hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-ink">{outcome.title}</p>
                              <p className="mt-1 text-sm text-slate-500">{project?.name}</p>
                            </div>
                            <StatusPill value={outcome.status} />
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    <EmptyState title="No outcomes yet" detail="Create a project outcome to start the loop." />
                  )}
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelBody>
                <SectionHeader title="Recent Build Logs" eyebrow="Verification" />
                {recentBuildLogs.length ? (
                  <div className="space-y-3">
                    {recentBuildLogs.map((log) => (
                      <div key={log.id} className="rounded-lg border border-line bg-white p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <StatusPill value={log.verificationStatus} />
                          <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm leading-6 text-slateText">{log.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No logs ingested" detail="Paste an agent result in a project workspace to create the first build log." />
                )}
              </PanelBody>
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProjectCard({ project, state }: { project: Project; state: ReturnType<typeof useBrainpress>["state"] }) {
  const memory = state.memories[project.id];
  const outcomes = state.outcomes.filter((outcome) => outcome.projectId === project.id);
  const memoryScore = memory ? memoryCompleteness(memory) : 0;
  const agentScore = memory ? agentReadiness(project, memory, outcomes) : 0;
  const verificationScore = verificationReadiness(project, outcomes);
  const nextOutcome = outcomes.find((outcome) => outcome.status !== "Absorbed") || outcomes[0];

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex min-h-72 flex-col justify-between rounded-lg border border-line bg-white p-5 transition hover:border-electric/40 hover:shadow-cockpit"
    >
      <div>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-semibold text-ink">{project.name}</p>
            <p className="mt-1 text-sm leading-6 text-slateText">{project.description}</p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-electric" />
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-slateText">{project.primaryGoal}</p>
      </div>
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Readiness label="Memory" value={memoryScore} />
          <Readiness label="Agent" value={agentScore} />
          <Readiness label="Verify" value={verificationScore} />
        </div>
        <div className="flex items-center gap-2 border-t border-line pt-4 text-sm text-slateText">
          <ClipboardList className="h-4 w-4 text-electric" />
          <span className="truncate">{nextOutcome?.title || "No outcome yet"}</span>
        </div>
      </div>
    </Link>
  );
}

function Readiness({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-mist p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 flex items-center gap-1 font-semibold text-ink">
        <FileText className="h-3.5 w-3.5 text-electric" />
        {value}%
      </p>
    </div>
  );
}
