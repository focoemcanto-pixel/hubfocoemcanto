alter table public.products
  add column if not exists redirect_url text,
  add column if not exists sales_page_url text,
  add column if not exists sales_url text,
  add column if not exists external_url text;

alter table public.courses
  add column if not exists redirect_url text,
  add column if not exists sales_page_url text,
  add column if not exists sales_url text,
  add column if not exists external_url text;

update public.products
set redirect_url = 'https://harmonia.focoemcanto.com',
    sales_page_url = 'https://harmonia.focoemcanto.com',
    sales_url = 'https://harmonia.focoemcanto.com',
    external_url = 'https://harmonia.focoemcanto.com'
where slug = 'foco-em-harmonia'
  and coalesce(redirect_url, sales_page_url, sales_url, external_url, '') = '';

update public.products
set redirect_url = 'https://focoemcanto.com',
    sales_page_url = 'https://focoemcanto.com',
    sales_url = 'https://focoemcanto.com',
    external_url = 'https://focoemcanto.com'
where slug = 'foco-em-canto'
  and coalesce(redirect_url, sales_page_url, sales_url, external_url, '') = '';

update public.courses
set redirect_url = products.redirect_url,
    sales_page_url = products.sales_page_url,
    sales_url = products.sales_url,
    external_url = products.external_url
from public.products
where courses.product_id = products.id
  and products.slug in ('foco-em-harmonia', 'foco-em-canto');
