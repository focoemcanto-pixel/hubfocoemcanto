import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string | null;
  status: string | null;
  cover_url: string | null;
  price_cents: number | null;
  billing_type: string | null;
  courses?: { id: string; slug: string | null }[] | null;
};

const compactProductsCss = `.admin-products-compact .admin-clean-hero{min-height:220px;padding:34px 36px}.admin-products-compact .admin-clean-hero h1{font-size:clamp(54px,7vw,86px);line-height:.88}.admin-products-compact .admin-course-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))!important;gap:18px!important;align-items:stretch!important}.admin-products-compact .admin-course-card{min-height:auto!important;height:430px!important;display:flex!important;flex-direction:column!important;border-radius:24px!important;overflow:hidden!important}.admin-products-compact .admin-course-cover{height:245px!important;min-height:245px!important;max-height:245px!important;position:relative!important;overflow:hidden!important;background:#09090d!important}.admin-products-compact .admin-course-cover img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}.admin-products-compact .admin-course-cover span{height:100%;display:grid;place-items:center;font-size:34px;color:#f5c76b}.admin-products-compact .admin-course-body{flex:1!important;padding:16px 18px!important;display:flex!important;flex-direction:column!important;gap:10px!important}.admin-products-compact .admin-course-body h2{font-size:22px!important;line-height:1.05!important;margin:0!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.admin-products-compact .admin-course-body p{font-size:13px!important;line-height:1.35!important;margin:0!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.admin-products-compact .product-meta-line{margin-top:auto!important;padding-top:10px!important}.admin-products-compact .admin-clean-actions{margin-top:4px!important}.admin-products-compact .admin-clean-button{padding:10px 14px!important;border-radius:14px!important}@media(max-width:720px){.admin-products-compact .admin-clean-hero{padding:28px 22px}.admin-products-compact .admin-course-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}.admin-products-compact .admin-course-card{height:340px!important;border-radius:18px!important}.admin-products-compact .admin-course-cover{height:185px!important;min-height:185px!important;max-height:185px!important}.admin-products-compact .admin-course-body{padding:12px!important}.admin-products-compact .admin-course-body h2{font-size:18px!important}.admin-products-compact .admin-clean-actions{display:grid!important;grid-template-columns:1fr!important}.admin-products-compact .admin-clean-button.secondary{display:none!important}}`;

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `produto-${Date.now()}`;
}

function money(cents?: number | null) {
  return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function createProduct(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const billingType = String(formData.get('billing_type') || 'one_time');
  const price = Number(formData.get('price') || 0);
  const type = billingType === 'recurring' ? 'subscription' : 'course';
  const slug = slugify(name);
  if (!name) return;

  const { data: product } = await supabase.from('products').insert({
    name,
    slug,
    description,
    type,
    billing_type: billingType,
    price_cents: Math.round(price * 100),
    status: 'draft',
    cta_label: 'Acessar',
  }).select('id').single();

  if (product?.id) {
    await supabase.from('courses').insert({
      product_id: product.id,
      title: name,
      slug,
      subtitle: description.slice(0, 140),
      description,
      status: 'draft',
      sort_order: 0,
    });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/produtos');
}

export default async function AdminProductsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('products')
    .select('id,name,slug,description,type,status,cover_url,price_cents,billing_type,courses(id,slug)')
    .order('created_at', { ascending: false });
  const products = (data || []) as ProductRow[];

  return (
    <main className="admin-page-clean admin-products-compact">
      <style dangerouslySetInnerHTML={{ __html: compactProductsCss }} />
      <section className="admin-clean-hero">
        <div>
          <span className="admin-clean-eyebrow">Escola Foco em Canto</span>
          <h1>Produtos</h1>
          <p>Crie, precifique e gerencie cursos ou assinaturas em um único lugar. Produto e área de membros agora são a mesma experiência.</p>
        </div>
        <label className="admin-clean-button primary" htmlFor="create-product-toggle">Criar produto</label>
      </section>

      <section className="admin-course-grid">
        {products.map((product) => {
          const previewHref = '/aluno/biblioteca';
          return (
            <article className="admin-course-card" key={product.id}>
              <div className="admin-course-cover">
                {product.cover_url ? <img src={product.cover_url} alt={product.name} /> : <span>{product.name.slice(0, 2).toUpperCase()}</span>}
              </div>
              <div className="admin-course-body">
                <span className="admin-clean-pill">{product.billing_type === 'recurring' ? 'Assinatura' : 'Pagamento único'} · {product.status || 'draft'}</span>
                <h2>{product.name}</h2>
                <p className="admin-clean-muted">{product.description || 'Sem descrição cadastrada.'}</p>
                <div className="product-meta-line"><strong>{money(product.price_cents)}</strong><small>{product.courses?.length || 0} área vinculada</small></div>
                <div className="admin-clean-actions">
                  <a className="admin-clean-button primary" href={`/admin/produtos/${product.id}`}>Gerenciar</a>
                  <a className="admin-clean-button secondary" href={previewHref}>Prévia</a>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <input id="create-product-toggle" className="admin-hidden-toggle" type="checkbox" />
      <section id="novo-produto" className="admin-clean-section admin-create-product-panel">
        <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Novo produto</span><h2>Criar produto</h2></div><label className="admin-clean-button secondary" htmlFor="create-product-toggle">Fechar</label></div>
        <form className="admin-clean-form" action={createProduct}>
          <label>Tipo de pagamento<select name="billing_type" defaultValue="one_time"><option value="one_time">Pagamento único</option><option value="recurring">Assinatura recorrente</option></select></label>
          <label>Nome do produto<input name="name" placeholder="Ex: Foco em Harmonia" required /></label>
          <label>Descrição<textarea name="description" placeholder="Explique a transformação do produto." /></label>
          <label>Preço<input name="price" type="number" min="0" step="0.01" placeholder="97.00" /></label>
          <button className="admin-clean-button primary" type="submit">Criar produto</button>
        </form>
      </section>
    </main>
  );
}
