create table if not exists community_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(follower_id, following_id)
);

create index if not exists idx_community_follows_follower on community_follows(follower_id);
create index if not exists idx_community_follows_following on community_follows(following_id);
