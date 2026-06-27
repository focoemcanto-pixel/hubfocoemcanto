-- Organização premium da biblioteca Stream no Hub
-- Rode no Supabase SQL Editor. Seguro para reexecutar.

alter table public.media_assets
  add column if not exists file_hash text,
  add column if not exists logical_path text,
  add column if not exists original_file_name text,
  add column if not exists original_size_bytes bigint,
  add column if not exists uploaded_size_bytes bigint,
  add column if not exists compression_profile text;

create index if not exists media_assets_stream_hash_idx
  on public.media_assets (file_hash)
  where file_hash is not null;

create index if not exists media_assets_stream_module_title_idx
  on public.media_assets (module_id, normalized_title)
  where provider = 'cloudflare_stream';

create unique index if not exists media_assets_stream_uid_unique_idx
  on public.media_assets (stream_uid)
  where stream_uid is not null;

-- Evita duplicidade lógica no mesmo módulo quando o nome normalizado é igual.
create unique index if not exists media_assets_stream_module_title_unique_idx
  on public.media_assets (module_id, normalized_title)
  where provider = 'cloudflare_stream' and normalized_title is not null;
