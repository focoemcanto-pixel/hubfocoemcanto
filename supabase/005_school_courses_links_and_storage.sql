create table if not exists course_module_links (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  module_id uuid references modules(id) on delete cascade,
  sort_order int default 0,
  created_at timestamptz default now(),
  unique(course_id, module_id)
);

alter table modules
  add column if not exists storage_provider text default 'drive',
  add column if not exists r2_prefix text,
  add column if not exists is_active boolean default true;

alter table exercises
  add column if not exists storage_provider text default 'drive',
  add column if not exists storage_path text,
  add column if not exists r2_key text;

insert into course_module_links (course_id, module_id, sort_order)
select c.id, m.id, coalesce(m.sort_order, 0)
from courses c
cross join modules m
where c.slug = 'sala-de-atividades-vip'
on conflict (course_id, module_id) do nothing;
