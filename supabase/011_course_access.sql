alter table subscriptions add column if not exists course_key text;
alter table subscriptions add column if not exists source_product_name text;

update subscriptions set source_product_name = product_name where source_product_name is null;

update subscriptions set course_key = 'grupo-vip' where course_key is null and (product_name ilike '%VIP%' or product_name ilike '%MEMBROS%');
update subscriptions set course_key = 'foco-em-harmonia' where course_key is null and product_name ilike '%Harmonia%';
update subscriptions set course_key = 'foco-em-canto' where course_key is null and product_name ilike '%Canto%';
update subscriptions set course_key = 'foco-em-melismas' where course_key is null and product_name ilike '%Melisma%';
update subscriptions set course_key = 'ebooks' where course_key is null and (product_name ilike '%Ebook%' or product_name ilike '%Guia%');
update subscriptions set course_key = 'outros' where course_key is null;

create index if not exists subscriptions_course_key_idx on subscriptions(course_key);
create index if not exists subscriptions_profile_course_idx on subscriptions(profile_id, course_key);
