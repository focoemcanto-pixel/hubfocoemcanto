alter table public.profiles
  add column if not exists whatsapp text;

comment on column public.profiles.whatsapp is 'Número de celular/WhatsApp informado no primeiro acesso para captação e contato com o lead.';

create index if not exists profiles_whatsapp_idx
  on public.profiles (whatsapp)
  where whatsapp is not null and whatsapp <> '';
