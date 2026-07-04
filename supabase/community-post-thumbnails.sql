alter table if exists community_posts
  add column if not exists poster_url text;

alter table if exists submissions
  add column if not exists poster_url text;

create index if not exists community_posts_poster_url_idx
  on community_posts (poster_url)
  where poster_url is not null;
