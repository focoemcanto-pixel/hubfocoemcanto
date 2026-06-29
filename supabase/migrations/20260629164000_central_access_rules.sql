create table if not exists public.central_access_rules (
  key text primary key,
  level text not null default 'open' check (level in ('open','subscriber','vip','locked')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.central_access_rules enable row level security;

drop policy if exists "central_access_rules_read_all" on public.central_access_rules;
create policy "central_access_rules_read_all" on public.central_access_rules
  for select using (true);

insert into public.central_access_rules (key, level, note) values
  ('central', 'open', 'Liberação geral da Central de Treinamento'),
  ('daily', 'open', 'Entrada dos exercícios diários'),
  ('personalized', 'open', 'Entrada dos exercícios personalizados'),
  ('repertoire', 'open', 'Estude seu repertório')
on conflict (key) do nothing;
