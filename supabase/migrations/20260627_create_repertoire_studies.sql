create table if not exists repertoire_studies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  song_name text not null,
  youtube_url text not null,
  youtube_video_id text not null,
  original_key text not null,
  study_key text not null,
  semitone_transposition int not null default 0,
  bpm int,
  notes text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repertoire_studies_bpm_check check (bpm is null or (bpm between 30 and 260)),
  constraint repertoire_studies_semitone_check check (semitone_transposition between -24 and 24)
);

create index if not exists repertoire_studies_profile_updated_idx on repertoire_studies(profile_id, updated_at desc);
create index if not exists repertoire_studies_video_idx on repertoire_studies(youtube_video_id);

alter table repertoire_studies enable row level security;

drop policy if exists "Students can read their repertoire studies" on repertoire_studies;
create policy "Students can read their repertoire studies"
  on repertoire_studies for select
  using (profile_id in (select id from profiles where email = auth.email()));

drop policy if exists "Students can insert their repertoire studies" on repertoire_studies;
create policy "Students can insert their repertoire studies"
  on repertoire_studies for insert
  with check (profile_id in (select id from profiles where email = auth.email()));

drop policy if exists "Students can update their repertoire studies" on repertoire_studies;
create policy "Students can update their repertoire studies"
  on repertoire_studies for update
  using (profile_id in (select id from profiles where email = auth.email()))
  with check (profile_id in (select id from profiles where email = auth.email()));
