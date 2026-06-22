-- Rode este SQL no Supabase para garantir persistência real do perfil e da comunidade.

alter table profiles
  add column if not exists bio text,
  add column if not exists headline text,
  add column if not exists whatsapp text,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz default now();

alter table community_posts
  add column if not exists likes_count int default 0,
  add column if not exists comments_count int default 0;

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

create table if not exists community_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, profile_id)
);

create table if not exists community_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, profile_id)
);

create unique index if not exists community_likes_unique_idx on community_likes(post_id, profile_id);
create unique index if not exists community_saves_unique_idx on community_saves(post_id, profile_id);
create unique index if not exists community_reposts_unique_idx on community_reposts(post_id, profile_id);

update community_posts p
set likes_count = coalesce(l.count, 0)
from (
  select post_id, count(*)::int as count
  from community_likes
  group by post_id
) l
where p.id = l.post_id;

update community_posts p
set comments_count = coalesce(c.count, 0)
from (
  select post_id, count(*)::int as count
  from community_comments
  group by post_id
) c
where p.id = c.post_id;
