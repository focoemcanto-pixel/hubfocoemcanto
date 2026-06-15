create table if not exists profiles (
  id uuid primary key,
  name text,
  email text unique,
  whatsapp text,
  role text default 'student',
  created_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  kiwify_customer_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references modules(id),
  title text not null,
  description text,
  drive_url text,
  media_type text default 'video',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  exercise_id uuid references exercises(id),
  file_url text,
  note text,
  visibility text default 'private',
  status text default 'pending_review',
  created_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id),
  rating int check (rating between 1 and 5),
  pitch_rating int check (pitch_rating between 1 and 5),
  rhythm_rating int check (rhythm_rating between 1 and 5),
  harmony_rating int check (harmony_rating between 1 and 5),
  confidence_rating int check (confidence_rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);
