alter table subscriptions add column if not exists course_key text;
alter table subscriptions add column if not exists source_product_name text;
create index if not exists subscriptions_course_key_idx on subscriptions(course_key);
create index if not exists subscriptions_profile_course_idx on subscriptions(profile_id, course_key);
