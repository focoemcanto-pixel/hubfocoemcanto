create table if not exists public.duet_render_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  source_video_url text not null,
  source_voice_url text not null,
  reference_url text not null,
  output_url text,
  source_video_path text,
  source_voice_path text,
  output_path text,
  caption text,
  visibility text not null default 'private',
  review_requested boolean not null default false,
  voice_volume integer not null default 100,
  reference_volume integer not null default 70,
  reference_offset_ms integer not null default 0,
  attempts integer not null default 0,
  error_message text,
  render_meta jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists duet_render_jobs_status_created_idx on public.duet_render_jobs(status, created_at);
create index if not exists duet_render_jobs_profile_created_idx on public.duet_render_jobs(profile_id, created_at desc);
create index if not exists duet_render_jobs_exercise_idx on public.duet_render_jobs(exercise_id);

alter table public.duet_render_jobs enable row level security;

drop policy if exists "duet render jobs owner read" on public.duet_render_jobs;
create policy "duet render jobs owner read"
  on public.duet_render_jobs
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = duet_render_jobs.profile_id
        and lower(p.email) = lower(coalesce(current_setting('request.jwt.claim.email', true), ''))
    )
  );
