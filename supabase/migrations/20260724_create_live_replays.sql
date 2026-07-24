create table if not exists public.live_replays (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid null references public.live_sessions(id) on delete set null,
  title text not null,
  slug text not null unique,
  description text null,
  drive_file_id text not null,
  drive_folder_id text null,
  file_name text null,
  mime_type text not null default 'video/webm',
  duration_seconds integer null,
  status text not null default 'published' check (status in ('draft','processing','published','expired','archived')),
  is_current boolean not null default false,
  available_until timestamptz null,
  published_at timestamptz null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_replays_current_idx on public.live_replays (is_current, published_at desc);
create index if not exists live_replays_status_idx on public.live_replays (status, published_at desc);

create or replace function public.set_single_current_live_replay()
returns trigger language plpgsql as $$
begin
  if new.is_current then
    update public.live_replays set is_current = false, updated_at = now() where id <> new.id and is_current = true;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists live_replays_single_current on public.live_replays;
create trigger live_replays_single_current
before insert or update of is_current on public.live_replays
for each row execute function public.set_single_current_live_replay();

alter table public.live_replays enable row level security;

drop policy if exists "Public can view published live replays" on public.live_replays;
create policy "Public can view published live replays"
on public.live_replays for select
to anon, authenticated
using (status = 'published');