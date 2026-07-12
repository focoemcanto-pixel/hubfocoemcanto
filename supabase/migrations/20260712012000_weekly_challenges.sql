create table if not exists public.weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  theme text not null,
  description text not null default '',
  instructions jsonb not null default '[]'::jsonb,
  duration_minutes integer not null default 5 check (duration_minutes between 1 and 60),
  level text not null default 'Todos',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_challenge_completions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.weekly_challenges(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (challenge_id, profile_id)
);

create index if not exists weekly_challenges_period_idx on public.weekly_challenges(starts_at, ends_at);
create index if not exists weekly_challenge_completions_profile_idx on public.weekly_challenge_completions(profile_id, completed_at desc);

alter table public.weekly_challenges enable row level security;
alter table public.weekly_challenge_completions enable row level security;

insert into public.weekly_challenges (
  slug,
  title,
  theme,
  description,
  instructions,
  duration_minutes,
  level,
  starts_at,
  ends_at,
  is_published
)
values (
  'afinacao-e-seguranca-vocal-semana-01',
  'Afinação e Segurança Vocal',
  'Afinação e segurança vocal',
  'Um treino curto para perceber a estabilidade da sua voz e aplicar o conteúdo da Quarta Vocal sem precisar enviar gravações no grupo.',
  '[
    "Escolha um trecho curto de uma música confortável para sua voz.",
    "Cante o trecho uma vez e observe onde a nota oscila ou perde firmeza.",
    "Repita lentamente, sustentando as vogais e reduzindo a força.",
    "Cante novamente no andamento original e compare a estabilidade.",
    "Finalize anotando mentalmente qual ajuste melhorou sua afinação."
  ]'::jsonb,
  5,
  'Todos',
  date_trunc('week', now()) + interval '4 days',
  date_trunc('week', now()) + interval '11 days' - interval '1 second',
  true
)
on conflict (slug) do nothing;
