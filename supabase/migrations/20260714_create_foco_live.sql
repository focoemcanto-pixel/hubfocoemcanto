create extension if not exists pgcrypto;

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  status text not null default 'draft' check (status in ('draft','scheduled','live','ended','cancelled')),
  access_type text not null default 'public' check (access_type in ('public','hybrid','restricted')),
  guest_access_enabled boolean not null default true,
  guest_fields jsonb not null default '{"name":true,"email":false,"whatsapp":false}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  daily_room_name text unique,
  daily_room_url text,
  recording_enabled boolean not null default false,
  current_scene text not null default 'waiting',
  offer_config jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_participants (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  guest_name text,
  guest_email text,
  guest_whatsapp text,
  participant_type text not null default 'guest' check (participant_type in ('host','student','guest')),
  daily_participant_id text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.live_messages (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  participant_id uuid references public.live_participants(id) on delete set null,
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 1000),
  is_highlighted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists live_sessions_status_starts_at_idx on public.live_sessions(status, starts_at);
create index if not exists live_participants_session_idx on public.live_participants(live_session_id, joined_at);
create index if not exists live_messages_session_idx on public.live_messages(live_session_id, created_at);

alter table public.live_sessions enable row level security;
alter table public.live_participants enable row level security;
alter table public.live_messages enable row level security;

create policy "public can read available live sessions"
on public.live_sessions for select
using (status in ('scheduled','live','ended') and access_type in ('public','hybrid'));

create policy "public can register live participation"
on public.live_participants for insert
with check (participant_type = 'guest');

create policy "public can read messages from public lives"
on public.live_messages for select
using (exists (
  select 1 from public.live_sessions s
  where s.id = live_session_id
    and s.status = 'live'
    and s.access_type in ('public','hybrid')
));

create policy "public can send live messages"
on public.live_messages for insert
with check (exists (
  select 1 from public.live_sessions s
  where s.id = live_session_id
    and s.status = 'live'
    and s.access_type in ('public','hybrid')
));

alter publication supabase_realtime add table public.live_sessions;
alter publication supabase_realtime add table public.live_messages;
