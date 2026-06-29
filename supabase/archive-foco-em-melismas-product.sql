-- Execute uma vez no Supabase SQL Editor se o card Foco em Melismas tiver sido recriado antes da correção do admin.
-- A home /aluno/biblioteca ignora produtos com status = archived.

update products
set status = 'archived'
where lower(coalesce(slug, '')) = 'foco-em-melismas'
   or lower(coalesce(name, '')) = 'foco em melismas';

update courses
set status = 'archived'
where lower(coalesce(slug, '')) = 'foco-em-melismas'
   or lower(coalesce(title, '')) = 'foco em melismas';
