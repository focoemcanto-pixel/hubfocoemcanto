create table if not exists public.vocal_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  gender text check (gender in ('male', 'female', 'unknown')) default 'unknown',
  lowest_note text not null,
  highest_note text not null,
  lowest_midi integer not null,
  highest_midi integer not null,
  comfortable_low_note text,
  comfortable_high_note text,
  comfortable_low_midi integer,
  comfortable_high_midi integer,
  voice_type text,
  source text not null default 'hub_vocal_map_mvp',
  created_at timestamptz not null default now()
);

create index if not exists vocal_profiles_profile_id_created_at_idx
  on public.vocal_profiles(profile_id, created_at desc);

alter table public.vocal_profiles enable row level security;

create policy if not exists "Admins service role can manage vocal profiles"
  on public.vocal_profiles
  for all
  using (true)
  with check (true);
