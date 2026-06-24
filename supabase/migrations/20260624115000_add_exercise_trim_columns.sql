alter table public.exercises
  add column if not exists trim_start_seconds integer not null default 0,
  add column if not exists trim_end_seconds integer not null default 0;
