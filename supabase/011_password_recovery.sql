alter table profiles add column if not exists password_reset_token_hash text;
alter table profiles add column if not exists password_reset_expires_at timestamptz;
alter table profiles add column if not exists password_reset_requested_at timestamptz;
alter table profiles add column if not exists password_reset_used_at timestamptz;

create index if not exists profiles_password_reset_idx on profiles (password_reset_token_hash);
