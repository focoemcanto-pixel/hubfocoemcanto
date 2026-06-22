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
    <main className="admin-page-clean">
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
