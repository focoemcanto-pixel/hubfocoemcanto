create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid null references profiles(id) on delete set null,
  email text null,
  event text not null,
  screen text null,
  product text null,
  source text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_created_idx on analytics_events(event, created_at desc);
create index if not exists analytics_events_profile_created_idx on analytics_events(profile_id, created_at desc);
create index if not exists analytics_events_email_created_idx on analytics_events(lower(email), created_at desc);
create index if not exists analytics_events_product_created_idx on analytics_events(product, created_at desc);

alter table analytics_events enable row level security;

do $$ begin
  create policy "Admins can manage analytics events" on analytics_events for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
