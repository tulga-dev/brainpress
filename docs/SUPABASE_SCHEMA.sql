-- Brainpress cloud persistence foundation.
-- Run this in the Supabase SQL editor for the project that backs the hosted Brainpress app.
-- RLS is enabled on every public table. Policies use owner_id = auth.uid().

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  repo_path_or_url text not null default '',
  preferred_agent text not null default 'Codex',
  primary_goal text not null default '',
  constraints jsonb not null default '[]'::jsonb,
  verification_commands jsonb not null default '[]'::jsonb,
  safety_rules text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.think_sessions (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  input text not null default '',
  mode text not null,
  artifact_type text not null,
  summary text not null default '',
  product_direction text not null default '',
  user_problem text not null default '',
  target_user text not null default '',
  proposed_solution text not null default '',
  mvp_scope jsonb not null default '[]'::jsonb,
  feature_ideas jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  recommended_build_tasks jsonb not null default '[]'::jsonb,
  status text not null default 'generated',
  agent_source text,
  agent_model text,
  agent_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_windows (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  think_session_id text not null references public.think_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  route text not null default '',
  preview_type text not null,
  user_scenario text not null default '',
  screen_description text not null default '',
  primary_cta text not null default '',
  sections jsonb not null default '[]'::jsonb,
  ui_principles jsonb not null default '[]'::jsonb,
  user_flow jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  status text not null default 'generated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.development_tasks (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  task_type text not null,
  status text not null,
  priority text not null,
  repo text not null default '',
  branch text not null default '',
  context jsonb not null default '[]'::jsonb,
  affected_areas jsonb not null default '[]'::jsonb,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  verification_commands jsonb not null default '[]'::jsonb,
  manual_qa_steps jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  dispatch_target text not null default 'github_issue',
  dispatch_mode text not null default 'github_based',
  codex_goal text not null default '',
  codex_goal_updated_at timestamptz,
  codex_run_id text,
  external_run_url text,
  pr_url text,
  result_summary text not null default '',
  result_raw text not null default '',
  source_think_session_id text,
  source_product_window_id text,
  source_run_issue_id text,
  agent_source text,
  agent_model text,
  agent_error text,
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.development_task_results (
  id text primary key,
  task_id text not null references public.development_tasks(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  raw_text text not null default '',
  summary text not null default '',
  changed_files jsonb not null default '[]'::jsonb,
  commands_run jsonb not null default '[]'::jsonb,
  verification_results jsonb not null default '[]'::jsonb,
  manual_qa_results jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  remaining_issues jsonb not null default '[]'::jsonb,
  next_tasks jsonb not null default '[]'::jsonb,
  pr_url text,
  recommended_status text not null default 'needs_review',
  acceptance_criteria_review jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.run_issues (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  summary text not null default '',
  provider text,
  likely_causes jsonb not null default '[]'::jsonb,
  recommended_steps jsonb not null default '[]'::jsonb,
  verification_steps jsonb not null default '[]'::jsonb,
  required_access jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  recommended_build_tasks jsonb not null default '[]'::jsonb,
  agent_source text,
  agent_model text,
  agent_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.github_dispatches (
  id text primary key,
  task_id text not null references public.development_tasks(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  repository text not null default '',
  issue_title text not null default '',
  issue_body text not null default '',
  issue_url text,
  status text not null default 'prepared',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.think_sessions enable row level security;
alter table public.product_windows enable row level security;
alter table public.development_tasks enable row level security;
alter table public.development_task_results enable row level security;
alter table public.run_issues enable row level security;
alter table public.github_dispatches enable row level security;

create policy "Profiles are owned by user" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Projects are owned by user" on public.projects
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Think sessions are owned by user" on public.think_sessions
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Product windows are owned by user" on public.product_windows
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Development tasks are owned by user" on public.development_tasks
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Development task results are owned by user" on public.development_task_results
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Run issues are owned by user" on public.run_issues
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "GitHub dispatches are owned by user" on public.github_dispatches
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create index if not exists projects_owner_id_idx on public.projects(owner_id);
create index if not exists think_sessions_project_id_idx on public.think_sessions(project_id);
create index if not exists product_windows_project_id_idx on public.product_windows(project_id);
create index if not exists development_tasks_project_id_idx on public.development_tasks(project_id);
create index if not exists development_task_results_project_id_idx on public.development_task_results(project_id);
create index if not exists run_issues_project_id_idx on public.run_issues(project_id);
create index if not exists github_dispatches_project_id_idx on public.github_dispatches(project_id);
