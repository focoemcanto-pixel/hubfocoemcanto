create table if not exists public.live_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  headline text,
  description text,
  price text,
  old_price text,
  checkout_url text not null,
  cta_label text not null default 'Quero garantir minha vaga',
  image_url text,
  badge text default 'Oferta especial',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_session_offers (
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  offer_id uuid not null references public.live_offers(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (live_session_id, offer_id)
);

create index if not exists live_offers_active_idx on public.live_offers(is_active, created_at desc);
create index if not exists live_session_offers_session_idx on public.live_session_offers(live_session_id, sort_order);

alter table public.live_offers enable row level security;
alter table public.live_session_offers enable row level security;

create policy "public can read active live offers"
on public.live_offers for select
using (is_active = true);

create policy "public can read live offer links"
on public.live_session_offers for select
using (true);
