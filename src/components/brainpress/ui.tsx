"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { AgentRunStatus, OutcomeStatus, PromptStatus, VerificationStatus } from "@/lib/types";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition",
        "focus:outline-none focus:ring-2 focus:ring-electric/20 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-electric bg-electric text-white hover:bg-blue-700",
        variant === "secondary" && "border-line bg-white text-ink hover:border-slate-300 hover:bg-slate-50",
        variant === "ghost" && "border-transparent bg-transparent text-slateText hover:bg-slate-100",
        variant === "danger" && "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
        className,
      )}
    />
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm outline-none transition",
        "placeholder:text-slate-400 focus:border-electric focus:ring-4 focus:ring-electric/10",
        className,
      )}
    />
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "min-h-28 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink shadow-sm outline-none transition",
        "placeholder:text-slate-400 focus:border-electric focus:ring-4 focus:ring-electric/10",
        className,
      )}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm outline-none transition",
        "focus:border-electric focus:ring-4 focus:ring-electric/10",
        className,
      )}
    />
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-lg border border-line bg-panel shadow-sm", className)}>{children}</section>;
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("p-5", className)}>{children}</div>;
}

export function SectionHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase text-electric">{eyebrow}</p> : null}
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const outcomeTone: Record<OutcomeStatus, string> = {
  Draft: "border-slate-200 bg-slate-50 text-slate-700",
  Planned: "border-blue-200 bg-blue-50 text-blue-700",
  Ready: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Running: "border-amber-200 bg-amber-50 text-amber-700",
  "Needs Fix": "border-rose-200 bg-rose-50 text-rose-700",
  "Needs Review": "border-violet-200 bg-violet-50 text-violet-700",
  Verified: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Absorbed: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

const promptTone: Record<PromptStatus, string> = {
  Draft: "border-slate-200 bg-slate-50 text-slate-700",
  Sent: "border-blue-200 bg-blue-50 text-blue-700",
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const verificationTone: Record<VerificationStatus, string> = {
  "Not run": "border-slate-200 bg-slate-50 text-slate-700",
  Passing: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Failing: "border-rose-200 bg-rose-50 text-rose-700",
  Mixed: "border-amber-200 bg-amber-50 text-amber-700",
  Unknown: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

const agentRunTone: Record<AgentRunStatus, string> = {
  Draft: "border-slate-200 bg-slate-50 text-slate-700",
  Prepared: "border-blue-200 bg-blue-50 text-blue-700",
  ReadyToRun: "border-indigo-200 bg-indigo-50 text-indigo-700",
  RunningCodex: "border-amber-200 bg-amber-50 text-amber-700",
  CodexCompleted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CodexFailed: "border-rose-200 bg-rose-50 text-rose-700",
  "Verification Running": "border-amber-200 bg-amber-50 text-amber-700",
  "Verification Passed": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Verification Failed": "border-rose-200 bg-rose-50 text-rose-700",
  VerificationRunning: "border-amber-200 bg-amber-50 text-amber-700",
  VerificationPassed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  VerificationFailed: "border-rose-200 bg-rose-50 text-rose-700",
  DiffReviewRequired: "border-violet-200 bg-violet-50 text-violet-700",
  Cancelled: "border-zinc-200 bg-zinc-50 text-zinc-700",
  TimedOut: "border-orange-200 bg-orange-50 text-orange-800",
  "Result Ingested": "border-zinc-200 bg-zinc-50 text-zinc-700",
  Absorbed: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

export function StatusPill({ value }: { value: OutcomeStatus | PromptStatus | VerificationStatus | AgentRunStatus }) {
  const tone =
    value in outcomeTone
      ? outcomeTone[value as OutcomeStatus]
      : value in promptTone
        ? promptTone[value as PromptStatus]
        : value in verificationTone
          ? verificationTone[value as VerificationStatus]
          : agentRunTone[value as AgentRunStatus];

  return <span className={cx("inline-flex rounded-md border px-2 py-1 text-xs font-medium", tone)}>{value}</span>;
}

export function Meter({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-md bg-slate-100">
      <div className="h-full rounded-md bg-electric transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-5 text-slateText">{detail}</p> : null}
    </div>
  );
}

export function MonoBlock({ value, className }: { value: string; className?: string }) {
  return (
    <pre
      className={cx(
        "max-h-[420px] overflow-auto rounded-md border border-line bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100",
        className,
      )}
    >
      {value || "Nothing generated yet."}
    </pre>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-mist p-6 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slateText">{detail}</p>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-sm font-medium text-ink">{children}</label>;
}
