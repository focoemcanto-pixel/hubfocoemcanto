alter table public.profiles
  add column if not exists hub_password_hash text;

comment on column public.profiles.hub_password_hash is 'Hash PBKDF2 da senha de acesso ao Hub Foco em Canto.';
