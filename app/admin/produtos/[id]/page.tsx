import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function updateProduct(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const id = String(formData.get('id') || '');
  if (!id) return;

  await supabase.from('products').update({
    name: String(formData.get('name') || '').trim(),
    slug: String(formData.get('slug') || '').trim(),
    description: String(formData.get('description') || '').trim(),
    type: String(formData.get('type') || 'course'),
    status: String(formData.get('status') || 'draft'),
    billing_type: String(formData.get('billing_type') || 'one_time'),
    price_cents: Math.round(Number(formData.get('price') || 0) * 100),
    cover_url: String(formData.get('cover_url') || '').trim(),
    cta_label: String(formData.get('cta_label') || 'Acessar').trim(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  revalidatePath('/admin');
  revalidatePath('/admin/produtos');
  revalidatePath(`/admin/produtos/${id}`);
}

function price(cents?: number | null) {
  return String(((cents || 0) / 100).toFixed(2));
}

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: product }, { data: courses }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('courses').select('id,title,slug,status').eq('product_id', id).order('sort_order'),
  ]);

  if (!product) {
    return <main className="page admin-shell"><section className="card"><h1>Produto não encontrado</h1><a className="button" href="/admin/produtos">Voltar</a></section></main>;
  }

  return (
    <main className="page admin-shell school-admin-shell">
      <section className="admin-hero school-hero compact-hero">
        <div>
          <p className="eyebrow">Editar produto</p>
          <h1>{product.name}</h1>
          <p className="muted">Ajuste oferta, preço, status e capa do produto.</p>
        </div>
        <a className="button secondary premium-button" href="/admin/produtos">Voltar</a>
      </section>

      <section className="school-two-column">
        <form className="card premium-panel premium-form" action={updateProduct}>
          <input type="hidden" name="id" value={product.id} />
          <label><span>Nome</span><input name="name" defaultValue={product.name || ''} required /></label>
          <label><span>Slug</span><input name="slug" defaultValue={product.slug || ''} required /></label>
          <label><span>Descrição</span><textarea name="description" defaultValue={product.description || ''} /></label>
          <div className="form-grid-two">
            <label><span>Tipo</span><select name="type" defaultValue={product.type || 'course'}><option value="course">Curso</option><option value="subscription">Assinatura</option><option value="ebook">Ebook</option><option value="mentorship">Mentoria</option></select></label>
            <label><span>Status</span><select name="status" defaultValue={product.status || 'draft'}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></select></label>
          </div>
          <div className="form-grid-two">
            <label><span>Cobrança</span><select name="billing_type" defaultValue={product.billing_type || 'one_time'}><option value="one_time">Pagamento único</option><option value="recurring">Recorrente</option></select></label>
            <label><span>Preço</span><input name="price" type="number" step="0.01" min="0" defaultValue={price(product.price_cents)} /></label>
          </div>
          <label><span>URL da capa</span><input name="cover_url" defaultValue={product.cover_url || ''} /></label>
          <label><span>Texto do botão</span><input name="cta_label" defaultValue={product.cta_label || 'Acessar'} /></label>
          <button className="button premium-button submit-glow" type="submit">Salvar produto</button>
        </form>

        <aside className="card premium-panel sticky-panel">
          <p className="eyebrow">Conteúdo vinculado</p>
          <h2>Cursos liberados</h2>
          <div className="admin-list">
            {(courses || []).length ? (courses || []).map((course) => (
              <a className="admin-row premium-row" href={`/admin/cursos/${course.id}`} key={course.id}>
                <div><span className="pill">{course.status}</span><h3>{course.title}</h3><p className="muted">{course.slug}</p></div>
              </a>
            )) : <div className="empty-premium-state"><strong>Nenhum curso vinculado.</strong><p className="muted">Crie um curso e selecione este produto como acesso.</p></div>}
          </div>
        </aside>
      </section>
    </main>
  );
}
