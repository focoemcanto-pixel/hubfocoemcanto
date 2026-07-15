alter table public.live_sessions
  add column if not exists waiting_room_locked boolean not null default false;

create table if not exists public.live_entry_requests (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  guest_name text not null,
  guest_email text,
  guest_whatsapp text,
  status text not null default 'pending' check (status in ('pending','approved','denied','consumed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  consumed_at timestamptz
);

create index if not exists live_entry_requests_pending_idx
on public.live_entry_requests(live_session_id, status, created_at);

alter table public.live_entry_requests enable row level security;
