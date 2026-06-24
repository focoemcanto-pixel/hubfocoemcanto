create table if not exists public.vocal_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  auth_user_id uuid nullable,
  lowest_note text nullable,
  lowest_midi integer nullable,
  lowest_frequency numeric nullable,
  highest_note text nullable,
  highest_midi integer nullable,
  highest_frequency numeric nullable,
  tessitura_low_note text nullable,
  tessitura_low_midi integer nullable,
  tessitura_high_note text nullable,
  tessitura_high_midi integer nullable,
  classification text nullable,
  classification_confidence numeric nullable,
  gender text nullable,
  test_status text default 'draft',
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint vocal_profiles_profile_id_key unique (profile_id)
);

create index if not exists vocal_profiles_profile_id_idx on public.vocal_profiles(profile_id);
create index if not exists vocal_profiles_auth_user_id_idx on public.vocal_profiles(auth_user_id);

create or replace function public.set_vocal_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vocal_profiles_set_updated_at on public.vocal_profiles;
create trigger vocal_profiles_set_updated_at
before update on public.vocal_profiles
for each row execute function public.set_vocal_profiles_updated_at();
