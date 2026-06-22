import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function createProduct(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const name = String(formData.get('name') || '').trim();
  const slug = String(formData.get('slug') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const type = String(formData.get('type') || 'course');
  const billingType = String(formData.get('billing_type') || 'one_time');
  const price = Number(formData.get('price') || 0);

  if (!name || !slug) return;

  await supabase.from('products').insert({
    name,
    slug,
    description,
    type,
    billing_type: billingType,
    price_cents: Math.round(price * 100),
    status: 'draft',
  });

  revalidatePath('/admin');
  revalidatePath('/admin/produtos');
}

function money(cents?: number | null) {
  const value = (cents || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function AdminProductsPage() {
  const supabase = createAdminClient();
  const { data: products } = await supabase
    .from('products')
    .select('id,name,slug,description,type,status,cover_url,price_cents,billing_type,cta_label,created_at')
    .order('created_at', { ascending: true });

  return (
    <main className="page admin-shell school-admin-shell">
      <section className="admin-hero school-hero compact-hero">
        <div>
          <p className="eyebrow">Catálogo da escola</p>
          <h1>Produtos</h1>
          <p className="muted">Defina o que o aluno pode comprar ou assinar. Depois cada produto libera cursos, salas e recursos.</p>
        </div>
        <a className="button secondary premium-button" href="/admin">Voltar ao resumo</a>
      </section>

      <nav className="admin-tabs school-tabs">
        <a href="/admin">Resumo</a>
        <a className="active" href="/admin/produtos">Produtos</a>
        <a href="/admin/cursos">Cursos</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/premium">Assinaturas</a>
        <a href="/admin/avaliacoes">Avaliações</a>
      </nav>

      <section className="school-two-column">
        <div className="school-product-grid">
          {(products || []).map((product) => (
            <article className="school-product-card" key={product.id}>
              <div className="product-cover-frame">
                {product.cover_url ? <img src={product.cover_url} alt={product.name} /> : <div className="product-cover-placeholder">{product.name.slice(0, 2).toUpperCase()}</div>}
                <span className={`product-status status-${product.status}`}>{product.status}</span>
              </div>
              <div className="product-card-body">
                <p className="eyebrow">{product.type} · {product.billing_type}</p>
                <h2>{product.name}</h2>
                <p className="muted">{product.description || 'Sem descrição cadastrada ainda.'}</p>
                <div className="product-meta-line">
                  <strong>{money(product.price_cents)}</strong>
                  <span>{product.slug}</span>
                </div>
                <div className="product-card-actions">
                  <a className="button premium-button" href={`/admin/produtos/${product.id}`}>Editar</a>
                  <a className="button secondary premium-button" href="/admin/cursos">Ver cursos</a>
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="card premium-panel sticky-panel">
          <p className="eyebrow">Novo produto</p>
          <h2>Criar oferta</h2>
          <p className="muted">Comece simples: Grupo VIP como assinatura e Foco em Harmonia como curso.</p>
          <form className="premium-form" action={createProduct}>
            <label><span>Nome</span><input name="name" placeholder="Ex: Foco em Harmonia" required /></label>
            <label><span>Slug</span><input name="slug" placeholder="foco-em-harmonia" required /></label>
            <label><span>Descrição</span><textarea name="description" placeholder="Explique o que esse produto libera." /></label>
            <div className="form-grid-two">
              <label><span>Tipo</span><select name="type" defaultValue="course"><option value="course">Curso</option><option value="subscription">Assinatura</option><option value="ebook">Ebook</option><option value="mentorship">Mentoria</option></select></label>
              <label><span>Cobrança</span><select name="billing_type" defaultValue="one_time"><option value="one_time">Pagamento único</option><option value="recurring">Recorrente</option></select></label>
            </div>
            <label><span>Preço</span><input name="price" type="number" min="0" step="0.01" placeholder="97.00" /></label>
            <button className="button premium-button submit-glow" type="submit">Criar produto</button>
          </form>
        </aside>
      </section>
    </main>
  );
}
