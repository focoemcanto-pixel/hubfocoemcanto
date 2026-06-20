-- Hub Foco em Canto: fila de avaliações e envios de duetos
-- Rode este script no SQL Editor do Supabase.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit)
values ('submission-media', 'submission-media', true, 524288000)
on conflict (id) do update
set public = true,
    file_size_limit = 524288000;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  exercise_id uuid references public.exercises(id) on delete cascade,
  file_url text,
  file_type text default 'duet_video',
  note text,
  visibility text default 'private',
  status text default 'pending_review',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade,
  rating int,
  pitch_rating int,
  rhythm_rating int,
  harmony_rating int,
  confidence_rating int,
  comment text,
  created_at timestamptz default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  exercise_id uuid references public.exercises(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete cascade,
  media_url text,
  caption text,
  category text default 'atividade',
  likes_count int default 0,
  comments_count int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_submissions_status on public.submissions(status);
create index if not exists idx_submissions_profile on public.submissions(profile_id);
create index if not exists idx_submissions_exercise on public.submissions(exercise_id);
create index if not exists idx_reviews_submission on public.reviews(submission_id);
create index if not exists idx_community_posts_submission on public.community_posts(submission_id);
