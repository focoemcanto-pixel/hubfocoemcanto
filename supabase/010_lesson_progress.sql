create table if not exists lesson_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  exercise_id uuid not null references exercises(id),
  last_position_seconds int not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  last_watched_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(profile_id, exercise_id)
);

create index if not exists lesson_progress_profile_last_watched_idx on lesson_progress(profile_id, last_watched_at desc);
create index if not exists lesson_progress_exercise_idx on lesson_progress(exercise_id);
