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

create table if not exists public.services (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  service_promise text not null default '',
  target_customer text not null default '',
  desired_outcome text not null default '',
  current_stage text not null default 'idea',
  main_agent_id text not null default '',
  agent_ids jsonb not null default '[]'::jsonb,
  service_workflow jsonb not null default '[]'::jsonb,
  human_approval_points jsonb not null default '[]'::jsonb,
  success_metrics jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_agents (
  id text primary key,
  service_id text not null references public.services(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text not null default '',
  goal text not null default '',
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  memory_scope text not null default '',
  permission_level text not null default 'founder_approval_required',
  escalation_rules jsonb not null default '[]'::jsonb,
  success_metric text not null default '',
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_windows (
    id text primary key,
    service_id text not null references public.services(id) on delete cascade,
    owner_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'empty',
    design_agent_name text,
    design_brief text,
    ux_strategy jsonb not null default '{}'::jsonb,
    information_architecture jsonb not null default '{}'::jsonb,
    screens jsonb not null default '[]'::jsonb,
    primary_flow jsonb not null default '[]'::jsonb,
    agent_interaction_points jsonb not null default '[]'::jsonb,
    human_approval_points jsonb not null default '[]'::jsonb,
    visual_system jsonb not null default '{}'::jsonb,
    component_system jsonb not null default '[]'::jsonb,
    interaction_states jsonb not null default '[]'::jsonb,
    responsive_behavior jsonb not null default '[]'::jsonb,
    accessibility_notes jsonb not null default '[]'::jsonb,
    implementation_notes jsonb not null default '[]'::jsonb,
    codex_implementation_prompt text,
    generated_at timestamptz,
    updated_at timestamptz not null default now()
  );

create table if not exists public.service_thinking_artifacts (
  id text primary key,
  service_id text not null references public.services(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'custom',
  title text not null default '',
  purpose text not null default '',
  content jsonb not null default '[]'::jsonb,
  source_message_ids jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0.65,
  status text not null default 'active',
  created_by_agent text not null default 'Agent Development Agent',
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

create table if not exists public.brainpress_constitutions (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  principles jsonb not null default '[]'::jsonb,
  quality_rules jsonb not null default '[]'::jsonb,
  testing_rules jsonb not null default '[]'::jsonb,
  architecture_rules jsonb not null default '[]'::jsonb,
  ux_rules jsonb not null default '[]'::jsonb,
  safety_rules jsonb not null default '[]'::jsonb,
  approval_rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brainpress_specs (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  service_id text references public.services(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  think_session_id text references public.think_sessions(id) on delete set null,
  product_window_id text references public.product_windows(id) on delete set null,
  title text not null,
  what text not null default '',
  why text not null default '',
  user_stories jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  non_goals jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  clarification_status text not null default 'needs_clarification',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clarifying_questions (
  id text primary key,
  spec_id text not null references public.brainpress_specs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  reason text not null default '',
  answer text,
  status text not null default 'open'
);

create table if not exists public.brainpress_plans (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  service_id text references public.services(id) on delete set null,
  spec_id text not null references public.brainpress_specs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  technology_choices jsonb not null default '[]'::jsonb,
  architecture_notes jsonb not null default '[]'::jsonb,
  data_model jsonb not null default '[]'::jsonb,
  api_contracts jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  validation_plan jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brainpress_task_lists (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  service_id text references public.services(id) on delete set null,
  plan_id text not null references public.brainpress_plans(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tasks jsonb not null default '[]'::jsonb,
  dependency_order jsonb not null default '[]'::jsonb,
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
  service_id text,
  source_spec_id text,
  source_plan_id text,
  source_spec_task_id text,
  agent_source text,
  agent_model text,
  agent_error text,
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.development_tasks add column if not exists source_spec_id text;
alter table public.development_tasks add column if not exists source_plan_id text;
alter table public.development_tasks add column if not exists source_spec_task_id text;
alter table public.development_tasks add column if not exists service_id text;
alter table public.services add column if not exists desired_outcome text not null default '';
alter table public.services add column if not exists service_workflow jsonb not null default '[]'::jsonb;
alter table public.services add column if not exists human_approval_points jsonb not null default '[]'::jsonb;
alter table public.services add column if not exists success_metrics jsonb not null default '[]'::jsonb;
alter table public.services add column if not exists open_questions jsonb not null default '[]'::jsonb;
alter table public.brainpress_specs add column if not exists service_id text;
alter table public.brainpress_plans add column if not exists service_id text;
alter table public.brainpress_task_lists add column if not exists service_id text;
alter table public.service_windows add column if not exists design_agent_name text;
alter table public.service_windows add column if not exists design_brief text;
alter table public.service_windows add column if not exists ux_strategy jsonb not null default '{}'::jsonb;
alter table public.service_windows add column if not exists information_architecture jsonb not null default '{}'::jsonb;
alter table public.service_windows add column if not exists visual_system jsonb not null default '{}'::jsonb;
alter table public.service_windows add column if not exists component_system jsonb not null default '[]'::jsonb;
alter table public.service_windows add column if not exists interaction_states jsonb not null default '[]'::jsonb;
alter table public.service_windows add column if not exists responsive_behavior jsonb not null default '[]'::jsonb;
alter table public.service_windows add column if not exists accessibility_notes jsonb not null default '[]'::jsonb;
alter table public.service_windows add column if not exists implementation_notes jsonb not null default '[]'::jsonb;
alter table public.service_windows add column if not exists codex_implementation_prompt text;

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
alter table public.services enable row level security;
alter table public.service_agents enable row level security;
alter table public.service_windows enable row level security;
alter table public.service_thinking_artifacts enable row level security;
alter table public.think_sessions enable row level security;
alter table public.product_windows enable row level security;
alter table public.brainpress_constitutions enable row level security;
alter table public.brainpress_specs enable row level security;
alter table public.clarifying_questions enable row level security;
alter table public.brainpress_plans enable row level security;
alter table public.brainpress_task_lists enable row level security;
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

create policy "Services are owned by user" on public.services
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Service agents are owned by user" on public.service_agents
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Service windows are owned by user" on public.service_windows
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Service thinking artifacts are owned by user" on public.service_thinking_artifacts
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.services s where s.id = service_id and s.owner_id = (select auth.uid()))
  );

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

create policy "Brainpress constitutions are owned by user" on public.brainpress_constitutions
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Brainpress specs are owned by user" on public.brainpress_specs
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Clarifying questions are owned by user" on public.clarifying_questions
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (
      select 1
      from public.brainpress_specs s
      join public.projects p on p.id = s.project_id
      where s.id = spec_id and p.owner_id = (select auth.uid())
    )
  );

create policy "Brainpress plans are owned by user" on public.brainpress_plans
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Brainpress task lists are owned by user" on public.brainpress_task_lists
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
create index if not exists services_owner_id_idx on public.services(owner_id);
create index if not exists service_agents_service_id_idx on public.service_agents(service_id);
create index if not exists service_windows_service_id_idx on public.service_windows(service_id);
create index if not exists service_thinking_artifacts_service_id_idx on public.service_thinking_artifacts(service_id);
create index if not exists think_sessions_project_id_idx on public.think_sessions(project_id);
create index if not exists product_windows_project_id_idx on public.product_windows(project_id);
create index if not exists brainpress_constitutions_project_id_idx on public.brainpress_constitutions(project_id);
create index if not exists brainpress_specs_project_id_idx on public.brainpress_specs(project_id);
create index if not exists clarifying_questions_spec_id_idx on public.clarifying_questions(spec_id);
create index if not exists brainpress_plans_project_id_idx on public.brainpress_plans(project_id);
create index if not exists brainpress_task_lists_project_id_idx on public.brainpress_task_lists(project_id);
create index if not exists development_tasks_project_id_idx on public.development_tasks(project_id);
create index if not exists development_task_results_project_id_idx on public.development_task_results(project_id);
create index if not exists run_issues_project_id_idx on public.run_issues(project_id);
create index if not exists github_dispatches_project_id_idx on public.github_dispatches(project_id);
