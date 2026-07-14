create table if not exists public.live_offer_events (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  offer_id uuid references public.live_offers(id) on delete set null,
  event_type text not null check (event_type in ('display','click','hide')),
  display_mode text check (display_mode in ('split','banner','floating','hidden')),
  participant_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists live_offer_events_session_idx
on public.live_offer_events(live_session_id, created_at desc);

create index if not exists live_offer_events_offer_idx
on public.live_offer_events(offer_id, event_type, created_at desc);

alter table public.live_offer_events enable row level security;

-- Escritas e leituras administrativas são feitas via service role no servidor.
