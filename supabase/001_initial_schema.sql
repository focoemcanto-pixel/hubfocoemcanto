create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text,
  email text unique not null,
  whatsapp text,
  avatar_url text,
  bio text,
  headline text,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  provider text not null default 'kiwify',
  provider_customer_id text,
  provider_subscription_id text,
  product_name text,
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  sort_order int default 0,
  cover_url text,
  icon text,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references modules(id) on delete cascade,
  title text not null,
  slug text unique not null,
  description text,
  drive_url text,
  media_url text,
  audio_url text,
  thumbnail_url text,
  media_type text default 'video',
  level int default 1,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete set null,
  file_url text,
  file_type text,
  note text,
  visibility text default 'private',
  status text default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id) on delete cascade,
  reviewer_id uuid references profiles(id) on delete set null,
  rating int check (rating between 1 and 5),
  pitch_rating int check (pitch_rating between 1 and 5),
  rhythm_rating int check (rhythm_rating between 1 and 5),
  harmony_rating int check (harmony_rating between 1 and 5),
  confidence_rating int check (confidence_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete set null,
  submission_id uuid references submissions(id) on delete set null,
  media_url text,
  caption text,
  category text default 'atividade',
  likes_count int default 0,
  comments_count int default 0,
  created_at timestamptz not null default now()
);

create table if not exists community_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, profile_id)
);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now()
);
