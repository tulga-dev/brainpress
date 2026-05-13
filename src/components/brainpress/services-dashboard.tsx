"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { useBrainpress } from "@/components/brainpress/use-brainpress";
import { Button, TextArea, TextInput, cx } from "@/components/brainpress/ui";
import {
  createDefaultServiceAgents,
  createEmptyServiceWindow,
  createProjectFromServiceInput,
  createServiceFromInput,
} from "@/lib/services";
import type { Memory } from "@/lib/types";

export function ServicesDashboard() {
  const { state, setState, storageSourceLabel, storageSourceReason } = useBrainpress();
  const [serviceName, setServiceName] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [outcome, setOutcome] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  function createService() {
    const project = createProjectFromServiceInput({ serviceName, targetCustomer, outcome });
    const service = createServiceFromInput({ project, serviceName, targetCustomer, outcome });
    const agents = createDefaultServiceAgents(service);
    const serviceWindow = createEmptyServiceWindow(service.id);
    const memory: Memory = {
      projectId: project.id,
      productSummary: service.servicePromise,
      vision: `Create and operate ${service.name} as an agent-powered service.`,
      targetUsers: service.targetCustomer,
      currentBuildState: "Service has been created and is ready for Think / Build / Run.",
      technicalArchitecture: "Brainpress Service workspace, Agent Team, ServiceWindow, Spec Loop, DevelopmentTasks, and Codex dispatch.",
      activeDecisions: "- Codex is the first execution provider.\n- Human approval is required before dispatch, merge, deploy, or verified status.",
      deprecatedIdeas: "",
      completedWork: "",
      openQuestions: "",
      knownIssues: "",
      roadmap: "- Define Service Spec.\n- Generate ServiceWindow UI/UX.\n- Create Codex-ready Build tasks.",
    };

    setState((current) => ({
      ...current,
      projects: [project, ...(current.projects || [])],
      services: [service, ...(current.services || [])],
      serviceAgents: [...agents, ...(current.serviceAgents || [])],
      serviceWindows: [serviceWindow, ...(current.serviceWindows || [])],
      memories: {
        ...(current.memories || {}),
        [project.id]: memory,
      },
    }));
    setServiceName("");
    setTargetCustomer("");
    setOutcome("");
    setShowCreate(false);
  }

  return (
    <main className="min-h-screen bg-[#03050b] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-lg border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Brainpress</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-5xl">Create and operate agent-based Services.</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
                Design AI-powered Services made of agents, tools, workflows, memory, permissions, specs, Codex build tasks, and run monitoring.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-300">
              <p className="font-mono text-[11px] uppercase tracking-wide text-blue-200">{storageSourceLabel}</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{storageSourceReason}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => setShowCreate((value) => !value)}>
              <Plus className="h-4 w-4" />
              Create Service
            </Button>
            <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
              Codex is the execution provider
            </span>
          </div>
        </header>

        {showCreate ? (
          <section className="rounded-lg border border-blue-300/20 bg-blue-400/10 p-5 shadow-2xl shadow-blue-950/10">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-200">New Service</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-white">What service do you want to create?</label>
                <TextInput
                  className="mt-2 border-white/10 bg-white/[0.05] text-white"
                  value={serviceName}
                  onChange={(event) => setServiceName(event.target.value)}
                  placeholder="Dental Lead Generation Service"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-white">Who will use this service?</label>
                <TextInput
                  className="mt-2 border-white/10 bg-white/[0.05] text-white"
                  value={targetCustomer}
                  onChange={(event) => setTargetCustomer(event.target.value)}
                  placeholder="Local dental clinics"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-white">What outcome should it deliver?</label>
                <TextArea
                  className="mt-2 min-h-24 border-white/10 bg-white/[0.05] text-white"
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  placeholder="Generate qualified inbound leads and summarize follow-up actions."
                />
              </div>
            </div>
            <Button className="mt-4" variant="primary" onClick={createService} disabled={!serviceName.trim() && !outcome.trim()}>
              <Sparkles className="h-4 w-4" />
              Create Service
            </Button>
          </section>
        ) : null}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-500">Services</p>
            <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-xs text-slate-400">
              {state.services.length} active
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {state.services.map((service) => {
              const agents = state.serviceAgents.filter((agent) => agent.serviceId === service.id);
              return (
                <Link
                  key={service.id}
                  href={`/services/${service.id}`}
                  className={cx(
                    "rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/10 transition",
                    "hover:border-blue-300/40 hover:bg-blue-400/10",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-white">{service.name}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{service.servicePromise}</p>
                    </div>
                    <span className="rounded-md border border-blue-300/20 bg-blue-400/10 px-2 py-1 font-mono text-[11px] uppercase text-blue-100">
                      {service.currentStage.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3">
                    <p className="text-sm text-slate-300">Target customer: {service.targetCustomer}</p>
                    <p className="text-sm text-slate-300">Agent team: {agents.length || service.agentIds.length} agents</p>
                    <p className="font-mono text-xs uppercase text-slate-500">Open Service Workspace</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
