create extension if not exists pgcrypto;

create table if not exists public.vocal_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  auth_user_id uuid,
  lowest_note text,
  lowest_midi integer,
  lowest_frequency numeric,
  highest_note text,
  highest_midi integer,
  highest_frequency numeric,
  tessitura_low_note text,
  tessitura_low_midi integer,
  tessitura_high_note text,
  tessitura_high_midi integer,
  classification text,
  classification_confidence numeric,
  gender text,
  test_status text default 'draft',
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.vocal_profiles add column if not exists profile_id uuid;
alter table public.vocal_profiles add column if not exists auth_user_id uuid;
alter table public.vocal_profiles add column if not exists lowest_note text;
alter table public.vocal_profiles add column if not exists lowest_midi integer;
alter table public.vocal_profiles add column if not exists lowest_frequency numeric;
alter table public.vocal_profiles add column if not exists highest_note text;
alter table public.vocal_profiles add column if not exists highest_midi integer;
alter table public.vocal_profiles add column if not exists highest_frequency numeric;
alter table public.vocal_profiles add column if not exists tessitura_low_note text;
alter table public.vocal_profiles add column if not exists tessitura_low_midi integer;
alter table public.vocal_profiles add column if not exists tessitura_high_note text;
alter table public.vocal_profiles add column if not exists tessitura_high_midi integer;
alter table public.vocal_profiles add column if not exists classification text;
alter table public.vocal_profiles add column if not exists classification_confidence numeric;
alter table public.vocal_profiles add column if not exists gender text;
alter table public.vocal_profiles add column if not exists test_status text default 'draft';
alter table public.vocal_profiles add column if not exists raw_data jsonb default '{}'::jsonb;
alter table public.vocal_profiles add column if not exists created_at timestamptz default now();
alter table public.vocal_profiles add column if not exists updated_at timestamptz default now();

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    if not exists (
      select 1 from information_schema.table_constraints
      where constraint_schema = 'public'
      and table_name = 'vocal_profiles'
      and constraint_name = 'vocal_profiles_profile_id_fkey'
    ) then
      alter table public.vocal_profiles
        add constraint vocal_profiles_profile_id_fkey
        foreign key (profile_id) references public.profiles(id) on delete cascade;
    end if;
  end if;
end $$;

create unique index if not exists vocal_profiles_profile_id_key on public.vocal_profiles(profile_id);
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

alter table public.vocal_profiles enable row level security;

drop policy if exists "vocal_profiles_select_own" on public.vocal_profiles;
create policy "vocal_profiles_select_own"
on public.vocal_profiles
for select
using (
  auth.uid() = auth_user_id
  or exists (
    select 1 from public.profiles p
    where p.id = vocal_profiles.profile_id
    and p.auth_user_id = auth.uid()
  )
);
