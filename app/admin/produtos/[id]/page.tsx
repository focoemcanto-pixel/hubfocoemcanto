import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = any;
type Search = { tab?: string };

function price(cents?: number | null) {
  return String(((cents || 0) / 100).toFixed(2));
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `item-${Date.now()}`;
}

async function updateProduct(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const id = String(formData.get('id') || '');
  const courseId = String(formData.get('course_id') || '');
  const name = String(formData.get('name') || '').trim();
  const slug = String(formData.get('slug') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const coverUrl = String(formData.get('cover_url') || '').trim();
  const status = String(formData.get('status') || 'draft');
  const billingType = String(formData.get('billing_type') || 'one_time');
  if (!id || !name || !slug) return;

  await supabase.from('products').update({
    name,
    slug,
    description,
    status,
    billing_type: billingType,
    type: billingType === 'recurring' ? 'subscription' : 'course',
    price_cents: Math.round(Number(formData.get('price') || 0) * 100),
    cover_url: coverUrl,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  if (courseId) {
    await supabase.from('courses').update({ title: name, slug, description, cover_url: coverUrl, status, updated_at: new Date().toISOString() }).eq('id', courseId);
  } else {
    await supabase.from('courses').insert({ product_id: id, title: name, slug, description, cover_url: coverUrl, status });
  }

  revalidatePath('/admin/produtos');
  revalidatePath(`/admin/produtos/${id}`);
}

async function createModule(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const productId = String(formData.get('product_id') || '');
  const courseId = String(formData.get('course_id') || '');
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const storageProvider = String(formData.get('storage_provider') || 'drive');
  if (!productId || !courseId || !title) return;

  const { data: module } = await supabase.from('modules').insert({
    title,
    slug: `${slugify(title)}-${Date.now()}`,
    description,
    sort_order: Number(formData.get('sort_order') || 0),
    storage_provider: storageProvider,
    is_active: true,
  }).select('id').single();

  if (module?.id) {
    await supabase.from('course_module_links').insert({ course_id: courseId, module_id: module.id, sort_order: Number(formData.get('sort_order') || 0) });
  }

  revalidatePath(`/admin/produtos/${productId}`);
}

export default async function ProductEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Search> }) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const activeTab = ['conteudo', 'alunos', 'comentarios', 'configuracoes'].includes(String(query.tab || '')) ? String(query.tab) : 'conteudo';
  const supabase = createAdminClient();
  const [{ data: product }, { data: course }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('courses').select('*').eq('product_id', id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ]);

  if (!product) return <main className="admin-page-clean"><section className="admin-clean-section"><h1>Produto não encontrado</h1><a className="admin-clean-button" href="/admin/produtos">Voltar</a></section></main>;

  const courseId = course?.id || '';
  const [{ data: links }, { data: allModules }] = await Promise.all([
    courseId ? supabase.from('course_module_links').select('module_id,sort_order').eq('course_id', courseId).order('sort_order') : Promise.resolve({ data: [] }),
    supabase.from('modules').select('id,title,slug,description,sort_order,cover_url,exercises(id,title,slug,media_type,sort_order)').order('sort_order'),
  ]);

  const linkedIds = new Set(((links || []) as Row[]).map((link) => link.module_id));
  const cleanModules = ((allModules || []) as Row[]).filter((module) => !String(module.description || '').toLowerCase().includes('importados da pasta'));
  const isVipProduct = String(product.slug || '').includes('grupo-vip') || String(product.name || '').toLowerCase().includes('grupo vip');
  const linkedModules = cleanModules.filter((module) => linkedIds.has(module.id));
  const modules = isVipProduct ? (linkedModules.length ? linkedModules : cleanModules) : linkedModules;
  const tabHref = (tab: string) => `/admin/produtos/${product.id}?tab=${tab}`;

  return (
    <main className="admin-page-clean">
      <section className="admin-clean-hero">
        <div><span className="admin-clean-eyebrow">Gerenciar produto</span><h1>{product.name}</h1><p>{product.description || 'Configure produto, preço, capa, módulos, aulas, alunos e comentários.'}</p></div>
        <a className="admin-clean-button secondary" href="/admin/produtos">Voltar</a>
      </section>

      <section className="admin-product-tabs">
        <a className={activeTab === 'conteudo' ? 'active' : ''} href={tabHref('conteudo')}>Conteúdo</a>
        <a className={activeTab === 'alunos' ? 'active' : ''} href={tabHref('alunos')}>Alunos</a>
        <a className={activeTab === 'comentarios' ? 'active' : ''} href={tabHref('comentarios')}>Comentários</a>
        <a className={activeTab === 'configuracoes' ? 'active' : ''} href={tabHref('configuracoes')}>Configurações</a>
      </section>

      {activeTab === 'conteudo' ? (
        <section className="admin-clean-section">
          <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Área de membros</span><h2>Conteúdo</h2></div><label className="admin-clean-button primary" htmlFor="new-module-toggle">Adicionar módulo</label></div>
          <input id="new-module-toggle" className="admin-hidden-toggle" type="checkbox" />
          <form className="admin-clean-form admin-module-create" action={createModule}>
            <input type="hidden" name="product_id" value={product.id} />
            <input type="hidden" name="course_id" value={courseId} />
            <label>Nome do módulo<input name="title" placeholder="Ex: Introdução" required /></label>
            <label>Descrição<textarea name="description" placeholder="O que o aluno verá neste módulo?" /></label>
            <div className="admin-clean-form-row"><label>Origem<select name="storage_provider" defaultValue="drive"><option value="drive">Google Drive</option><option value="r2">Cloudflare R2</option></select></label><label>Ordem<input name="sort_order" type="number" defaultValue="0" /></label></div>
            <button className="admin-clean-button primary" type="submit">Criar módulo</button>
          </form>

          <div className="admin-member-modules">
            {modules.map((module) => {
              const lessons = ((module.exercises || []) as Row[]).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
              const importUrl = `/admin/conteudos/selecionar-drive?module=${module.id}`;
              return (
                <article className="admin-member-module" key={module.id}>
                  <div className="admin-member-module-head"><div><span className="admin-clean-pill">drive · {lessons.length} conteúdos</span><h3>{module.title}</h3><p>{module.description || 'Sem descrição.'}</p></div><div className="admin-clean-actions"><a className="admin-clean-button secondary" href={`/admin/biblioteca/${module.id}`}>Editar módulo</a><a className="admin-clean-button primary" href={importUrl}>+ Aula</a></div></div>
                  <div className="admin-lesson-list">
                    {lessons.map((lesson) => <div className="admin-lesson-row" key={lesson.id}><span>::</span><strong>{lesson.title}</strong><small>{lesson.media_type || 'video'}</small><a href={`/admin/conteudos/exercicios/${lesson.id}/editar`}>Editar</a></div>)}
                    {!lessons.length ? <p className="admin-clean-muted">Nenhuma aula ainda. Clique em + Aula para puxar do Drive ou preparar R2.</p> : null}
                  </div>
                </article>
              );
            })}
            {!modules.length ? <div className="admin-empty-state"><strong>Nenhum módulo criado.</strong><p>Crie o primeiro módulo e depois adicione aulas pelo Drive/R2.</p></div> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'configuracoes' ? (
        <section className="admin-clean-section">
          <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Produto</span><h2>Configurações</h2></div></div>
          <form className="admin-clean-form" action={updateProduct}>
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="course_id" value={courseId} />
            <label>Nome do produto<input name="name" defaultValue={product.name || ''} required /></label>
            <label>Slug<input name="slug" defaultValue={product.slug || ''} required /></label>
            <label>Descrição<textarea name="description" defaultValue={product.description || ''} /></label>
            <div className="admin-clean-form-row"><label>Tipo de pagamento<select name="billing_type" defaultValue={product.billing_type || 'one_time'}><option value="one_time">Pagamento único</option><option value="recurring">Assinatura recorrente</option></select></label><label>Preço<input name="price" type="number" step="0.01" defaultValue={price(product.price_cents)} /></label></div>
            <div className="admin-clean-form-row"><label>Status<select name="status" defaultValue={product.status || 'draft'}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></select></label><label>URL da capa<input name="cover_url" defaultValue={product.cover_url || ''} /></label></div>
            <button className="admin-clean-button primary" type="submit">Salvar produto</button>
          </form>
        </section>
      ) : null}

      {activeTab === 'alunos' ? <section className="admin-clean-section"><span className="admin-clean-eyebrow">Alunos</span><h2>Alunos deste produto</h2><p className="admin-clean-muted">Próxima etapa: listar compradores, status de acesso e liberação via webhook.</p></section> : null}
      {activeTab === 'comentarios' ? <section className="admin-clean-section"><span className="admin-clean-eyebrow">Comentários</span><h2>Comentários</h2><p className="admin-clean-muted">Próxima etapa: centralizar comentários por aula e módulo.</p></section> : null}
    </main>
  );
}
