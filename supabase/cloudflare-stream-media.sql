-- Cloudflare Stream media infrastructure
-- Execute no SQL editor do Supabase antes de ativar a sincronização automática.

alter table public.exercises
  add column if not exists stream_uid text,
  add column if not exists stream_status text,
  add column if not exists stream_thumbnail_url text,
  add column if not exists stream_duration_seconds numeric,
  add column if not exists stream_synced_at timestamptz;

create index if not exists exercises_stream_uid_idx on public.exercises(stream_uid);
create index if not exists exercises_stream_status_idx on public.exercises(stream_status);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('cloudflare_stream', 'cloudflare_r2', 'google_drive')),
  media_type text not null check (media_type in ('video', 'audio', 'image', 'file')),
  title text,
  normalized_title text,
  product_id uuid null references public.products(id) on delete set null,
  module_id uuid null references public.modules(id) on delete set null,
  exercise_id uuid null references public.exercises(id) on delete set null,
  stream_uid text,
  r2_url text,
  drive_url text,
  thumbnail_url text,
  duration_seconds numeric,
  status text default 'pending',
  raw jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_provider_idx on public.media_assets(provider);
create unique index if not exists media_assets_stream_uid_unique_idx on public.media_assets(stream_uid) where stream_uid is not null;
create index if not exists media_assets_normalized_title_idx on public.media_assets(normalized_title);
create index if not exists media_assets_exercise_id_idx on public.media_assets(exercise_id);
create index if not exists media_assets_module_id_idx on public.media_assets(module_id);
create index if not exists media_assets_product_id_idx on public.media_assets(product_id);

alter table public.media_assets enable row level security;

-- O app usa service role no admin. RLS fica ativa para segurança.
-- Se precisar leitura pública/autenticada depois, criar policy específica.
