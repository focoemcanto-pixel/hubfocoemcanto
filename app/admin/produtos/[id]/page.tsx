import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminInlineLessonName } from '@/components/admin-inline-lesson-name';
import { AdminLoadingLink } from '@/components/admin-loading-link';
import { AdminProductCoverPreview } from '@/components/admin-product-cover-preview';
import { AdminMediaUploader } from '@/components/admin-media-uploader';

export const dynamic = 'force-dynamic';

type Row = any;
type Search = { tab?: string; saved?: string; error?: string };

function price(cents?: number | null) {
  return String(((cents || 0) / 100).toFixed(2));
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `item-${Date.now()}`;
}

async function nextModuleOrder(supabase: ReturnType<typeof createAdminClient>) {
  const { data } = await supabase.from('modules').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  return Number(data?.sort_order || 0) + 1;
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

  const submittedOrder = Number(formData.get('sort_order') || 0);
  const sortOrder = submittedOrder > 0 ? submittedOrder : await nextModuleOrder(supabase);

  const { data: module } = await supabase.from('modules').insert({
    title,
    slug: `${slugify(title)}-${Date.now()}`,
    description,
    sort_order: sortOrder,
    storage_provider: storageProvider,
    is_active: true,
  }).select('id').single();

  if (module?.id) await supabase.from('course_module_links').insert({ course_id: courseId, module_id: module.id, sort_order: sortOrder });
  revalidatePath(`/admin/produtos/${productId}`);
  revalidatePath('/aluno');
  revalidatePath('/aluno/biblioteca');
}

async function moveModule(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const productId = String(formData.get('product_id') || '');
  const courseId = String(formData.get('course_id') || '');
  const moduleId = String(formData.get('module_id') || '');
  const direction = String(formData.get('direction') || 'up');
  if (!moduleId) return;

  const { data: modulesData } = await supabase
    .from('modules')
    .select('id,sort_order,is_active,description')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  let list = ((modulesData || []) as Row[]).filter((module) => !String(module.description || '').toLowerCase().includes('importados da pasta'));

  if (courseId) {
    const { data: linksData } = await supabase.from('course_module_links').select('module_id,sort_order').eq('course_id', courseId).order('sort_order', { ascending: true });
    const linkOrder = new Map(((linksData || []) as Row[]).map((link) => [String(link.module_id), Number(link.sort_order || 0)]));
    if (linkOrder.size) list = list.filter((module) => linkOrder.has(String(module.id))).sort((a, b) => (linkOrder.get(String(a.id)) || Number(a.sort_order || 0)) - (linkOrder.get(String(b.id)) || Number(b.sort_order || 0)));
  }

  const index = list.findIndex((module) => String(module.id) === moduleId);
  const targetIndex = direction === 'down' ? index + 1 : index - 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return;

  const current = list[index];
  const target = list[targetIndex];
  const currentOrder = Number(current.sort_order || index + 1);
  const targetOrder = Number(target.sort_order || targetIndex + 1);

  await Promise.all([
    supabase.from('modules').update({ sort_order: targetOrder }).eq('id', current.id),
    supabase.from('modules').update({ sort_order: currentOrder }).eq('id', target.id),
  ]);

  if (courseId) {
    await Promise.all([
      supabase.from('course_module_links').update({ sort_order: targetOrder }).eq('course_id', courseId).eq('module_id', current.id),
      supabase.from('course_module_links').update({ sort_order: currentOrder }).eq('course_id', courseId).eq('module_id', target.id),
    ]);
  }

  if (productId) revalidatePath(`/admin/produtos/${productId}`);
  revalidatePath('/aluno');
  revalidatePath('/aluno/biblioteca');
}

async function deleteLesson(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const productId = String(formData.get('product_id') || '');
  const lessonId = String(formData.get('lesson_id') || '');
  if (!lessonId) return;
  await supabase.from('community_posts').delete().eq('exercise_id', lessonId);
  await supabase.from('submissions').delete().eq('exercise_id', lessonId);
  await supabase.from('exercises').delete().eq('id', lessonId);
  if (productId) revalidatePath(`/admin/produtos/${productId}`);
}

async function deleteModule(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const productId = String(formData.get('product_id') || '');
  const courseId = String(formData.get('course_id') || '');
  const moduleId = String(formData.get('module_id') || '');
  if (!moduleId) return;
  if (courseId) await supabase.from('course_module_links').delete().eq('course_id', courseId).eq('module_id', moduleId);
  await supabase.from('modules').update({ is_active: false, sort_order: 9999 }).eq('id', moduleId);
  if (productId) revalidatePath(`/admin/produtos/${productId}`);
  revalidatePath('/aluno');
  revalidatePath('/aluno/biblioteca');
}

function matchesProduct(subscription: Row, product: Row, isVipProduct: boolean) {
  const name = String(subscription.product_name || '').toLowerCase();
  const productName = String(product.name || '').toLowerCase();
  const slug = String(product.slug || '').toLowerCase().replace(/-/g, ' ');
  if (isVipProduct) return name.includes('vip') || name.includes('grupo') || name.includes('fh') || !name;
  return name.includes(productName) || name.includes(slug);
}

export default async function ProductEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Search> }) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const activeTab = ['conteudo', 'midia', 'alunos', 'comentarios', 'configuracoes'].includes(String(query.tab || '')) ? String(query.tab) : 'conteudo';
  const supabase = createAdminClient();

  const [{ data: product }, { data: course }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('courses').select('*').eq('product_id', id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ]);

  if (!product) return <main className="admin-page-clean"><section className="admin-clean-section"><h1>Produto nao encontrado</h1><a className="admin-clean-button" href="/admin/produtos">Voltar</a></section></main>;

  const courseId = course?.id || '';
  const isVipProduct = String(product.slug || '').includes('grupo-vip') || String(product.name || '').toLowerCase().includes('grupo vip');
  const [{ data: links }, { data: allModules }, { data: profiles }, { data: subscriptions }] = await Promise.all([
    courseId ? supabase.from('course_module_links').select('module_id,sort_order').eq('course_id', courseId).order('sort_order', { ascending: true }) : Promise.resolve({ data: [] }),
    supabase.from('modules').select('id,title,slug,description,sort_order,cover_url,is_active,exercises(id,title,slug,media_type,sort_order,media_url,drive_url)').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('profiles').select('id,name,email,whatsapp,avatar_url,role,created_at').order('created_at', { ascending: false }),
    supabase.from('subscriptions').select('profile_id,status,product_name,current_period_end,created_at').order('created_at', { ascending: false }),
  ]);

  const linkOrder = new Map(((links || []) as Row[]).map((link) => [String(link.module_id), Number(link.sort_order || 0)]));
  const linkedIds = new Set(((links || []) as Row[]).map((link) => link.module_id));
  const cleanModules = ((allModules || []) as Row[]).filter((module) => module.is_active !== false).filter((module) => !String(module.description || '').toLowerCase().includes('importados da pasta'));
  const linkedModules = cleanModules.filter((module) => linkedIds.has(module.id));
  const modules = (isVipProduct ? (linkedModules.length ? linkedModules : cleanModules) : linkedModules).sort((a, b) => {
    const aOrder = linkOrder.get(String(a.id)) || Number(a.sort_order || 0);
    const bOrder = linkOrder.get(String(b.id)) || Number(b.sort_order || 0);
    return aOrder - bOrder;
  });
  const tabHref = (tab: string) => `/admin/produtos/${product.id}?tab=${tab}`;

  const totalLessons = modules.reduce((sum, module) => sum + ((module.exercises || []) as Row[]).length, 0);
  const migratedLessons = modules.reduce((sum, module) => sum + ((module.exercises || []) as Row[]).filter((lesson) => lesson.media_url).length, 0);
  const driveLessons = modules.reduce((sum, module) => sum + ((module.exercises || []) as Row[]).filter((lesson) => lesson.drive_url && !lesson.media_url).length, 0);

  const subsByProfile = new Map<string, Row[]>();
  ((subscriptions || []) as Row[]).forEach((sub) => {
    const key = String(sub.profile_id || '');
    if (!key) return;
    const list = subsByProfile.get(key) || [];
    list.push(sub);
    subsByProfile.set(key, list);
  });
  const productStudents = ((profiles || []) as Row[]).map((profile) => {
    const subs = subsByProfile.get(profile.id) || [];
    const related = subs.find((sub) => matchesProduct(sub, product, isVipProduct)) || subs[0];
    return { ...profile, subscription: related, hasRelatedSubscription: Boolean(related) };
  }).filter((profile) => isVipProduct ? true : profile.hasRelatedSubscription);

  return (
    <main className="admin-page-clean">
      <section className="admin-clean-hero">
        <div><span className="admin-clean-eyebrow">Gerenciar produto</span><h1>{product.name}</h1><p>{product.description || 'Configure produto, preco, capa, modulos, aulas, alunos e comentarios.'}</p></div>
        <a className="admin-clean-button secondary" href="/admin/produtos">Voltar</a>
      </section>

      <section className="admin-product-tabs">
        <a className={activeTab === 'conteudo' ? 'active' : ''} href={tabHref('conteudo')}>Conteudo</a>
        <a className={activeTab === 'midia' ? 'active' : ''} href={tabHref('midia')}>Mídia</a>
        <a className={activeTab === 'alunos' ? 'active' : ''} href={tabHref('alunos')}>Alunos</a>
        <a className={activeTab === 'comentarios' ? 'active' : ''} href={tabHref('comentarios')}>Comentarios</a>
        <a className={activeTab === 'configuracoes' ? 'active' : ''} href={tabHref('configuracoes')}>Configuracoes</a>
      </section>

      {activeTab === 'conteudo' ? (
        <section className="admin-clean-section">
          <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Area de membros</span><h2>Conteudo</h2></div><label className="admin-clean-button primary" htmlFor="new-module-toggle">Adicionar modulo</label></div>
          <input id="new-module-toggle" className="admin-hidden-toggle" type="checkbox" />
          <form className="admin-clean-form admin-module-create" action={createModule}>
            <input type="hidden" name="product_id" value={product.id} />
            <input type="hidden" name="course_id" value={courseId} />
            <label>Nome do modulo<input name="title" placeholder="Ex: Introducao" required /></label>
            <label>Descricao<textarea name="description" placeholder="O que o aluno vera neste modulo?" /></label>
            <div className="admin-clean-form-row"><label>Origem<select name="storage_provider" defaultValue="drive"><option value="drive">Google Drive</option><option value="r2">Cloudflare R2</option></select></label><label>Ordem<input name="sort_order" type="number" placeholder="automático" /></label></div>
            <button className="admin-clean-button primary" type="submit">Criar modulo</button>
          </form>

          <div className="admin-member-modules">
            {modules.map((module, index) => {
              const lessons = ((module.exercises || []) as Row[]).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
              const importUrl = `/admin/conteudos/selecionar-drive?module=${module.id}`;
              const displayOrder = String(index + 1).padStart(2, '0');
              const moduleMigrated = lessons.filter((lesson) => lesson.media_url).length;
              const sourceLabel = moduleMigrated === lessons.length && lessons.length ? 'R2' : moduleMigrated ? 'Drive/R2' : 'drive';
              return (
                <article className="admin-member-module" key={module.id}>
                  <div className="admin-member-module-head">
                    <div><span className="admin-clean-pill">{displayOrder} · {sourceLabel} · {lessons.length} conteudos</span><h3>{module.title}</h3><p>{module.description || 'Sem descricao.'}</p></div>
                    <div className="admin-clean-actions">
                      <form action={moveModule}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="course_id" value={courseId} /><input type="hidden" name="module_id" value={module.id} /><input type="hidden" name="direction" value="up" /><button className="admin-clean-button secondary" type="submit" disabled={index === 0} title="Subir módulo">↑</button></form>
                      <form action={moveModule}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="course_id" value={courseId} /><input type="hidden" name="module_id" value={module.id} /><input type="hidden" name="direction" value="down" /><button className="admin-clean-button secondary" type="submit" disabled={index === modules.length - 1} title="Descer módulo">↓</button></form>
                      <a className="admin-clean-button secondary" href={`/admin/biblioteca/${module.id}?product=${product.id}`}>Editar modulo</a>
                      <AdminLoadingLink className="admin-clean-button primary" href={importUrl} loadingLabel="Abrindo Drive...">+ Aula</AdminLoadingLink>
                      <form action={deleteModule}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="course_id" value={courseId} /><input type="hidden" name="module_id" value={module.id} /><button className="admin-clean-button danger" type="submit">Excluir modulo</button></form>
                    </div>
                  </div>
                  <div className="admin-lesson-list">
                    {lessons.map((lesson) => <div className="admin-lesson-row" key={lesson.id}><span className="admin-drag-dot">::</span><AdminInlineLessonName moduleId={module.id} lessonId={lesson.id} initialTitle={lesson.title || ''} /><small>{lesson.media_url ? 'R2' : lesson.media_type || 'video'}</small><div className="admin-lesson-actions"><a href={`/aluno/aula/${lesson.slug}`} title="Abrir aula">Abrir</a><a href={`/admin/conteudos/exercicios/${lesson.id}/editar`} title="Editar aula">Editar</a><form action={deleteLesson}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="lesson_id" value={lesson.id} /><button type="submit" title="Excluir aula">Excluir</button></form></div></div>)}
                    {!lessons.length ? <p className="admin-clean-muted">Nenhuma aula ainda. Clique em + Aula para puxar do Drive ou preparar R2.</p> : null}
                  </div>
                </article>
              );
            })}
            {!modules.length ? <div className="admin-empty-state"><strong>Nenhum modulo criado.</strong><p>Crie o primeiro modulo e depois adicione aulas pelo Drive/R2.</p></div> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'midia' ? (
        <section className="admin-clean-section">
          <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Mídia do produto</span><h2>Biblioteca e migração</h2><p className="admin-clean-muted">Organização por produto e módulo no Cloudflare R2.</p></div></div>
          <section className="admin-grid admin-section">
            <article className="admin-stat"><span>Aulas</span><strong>{totalLessons}</strong><p className="muted">Conteúdos vinculados ao produto.</p></article>
            <article className="admin-stat"><span>No R2</span><strong>{migratedLessons}</strong><p className="muted">Já usam media_url.</p></article>
            <article className="admin-stat"><span>Pendentes</span><strong>{driveLessons}</strong><p className="muted">Ainda usam Drive como origem principal.</p></article>
          </section>
          <AdminMediaUploader productId={product.id} productName={product.name} />
        </section>
      ) : null}

      {activeTab === 'configuracoes' ? (
        <section className="admin-clean-section">
          <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Produto</span><h2>Configuracoes</h2>{query.saved ? <p className="admin-save-success">Alterações salvas com sucesso.</p> : null}{query.error ? <p className="admin-save-error">Não foi possível salvar. Verifique os dados e tente novamente.</p> : null}</div></div>
          <form className="admin-clean-form" action={`/admin/produtos/${product.id}/salvar`} method="post" encType="multipart/form-data">
            <input type="hidden" name="course_id" value={courseId} />
            <section className="product-config-grid">
              <div className="product-config-fields">
                <label>Nome do produto<input name="name" defaultValue={product.name || ''} required /></label>
                <label>Slug<input name="slug" defaultValue={product.slug || ''} required /></label>
                <label>Descricao<textarea name="description" defaultValue={product.description || ''} /></label>
                <div className="admin-clean-form-row"><label>Tipo de pagamento<select name="billing_type" defaultValue={product.billing_type || 'one_time'}><option value="one_time">Pagamento unico</option><option value="recurring">Assinatura recorrente</option></select></label><label>Preco<input name="price" type="number" step="0.01" defaultValue={price(product.price_cents)} /></label></div>
                <div className="admin-clean-form-row"><label>Status<select name="status" defaultValue={product.status || 'draft'}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></select></label><label>URL da capa<input name="cover_url" defaultValue={product.cover_url || ''} /></label></div>
              </div>
              <AdminProductCoverPreview initialUrl={product.cover_url} fallback={String(product.name || 'FC').slice(0, 2).toUpperCase()} />
            </section>
            <button className="admin-clean-button primary" type="submit">Salvar produto</button>
          </form>
        </section>
      ) : null}

      {activeTab === 'alunos' ? <section className="admin-clean-section"><div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Alunos</span><h2>Alunos deste produto</h2></div><strong>{productStudents.length} encontrados</strong></div><div className="admin-students-list">{productStudents.map((student) => { const sub = student.subscription || {}; const active = ['active', 'paid', 'trialing'].includes(String(sub.status || '').toLowerCase()); return <article className="admin-student-row" key={student.id}><div className="admin-student-avatar">{student.avatar_url ? <img src={student.avatar_url} alt="" /> : <span>{String(student.name || student.email || 'A').slice(0, 1).toUpperCase()}</span>}</div><div><h3>{student.name || 'Aluno sem nome'}</h3><p>{student.email || 'Sem e-mail'}{student.whatsapp ? ` · ${student.whatsapp}` : ''}</p></div><div><span className={active ? 'student-status active' : 'student-status'}>{sub.status || 'sem assinatura'}</span><small>{sub.product_name || product.name}</small></div></article>; })}{!productStudents.length ? <p className="admin-clean-muted">Nenhum aluno encontrado para este produto ainda.</p> : null}</div></section> : null}
      {activeTab === 'comentarios' ? <section className="admin-clean-section"><span className="admin-clean-eyebrow">Comentarios</span><h2>Comentarios</h2><p className="admin-clean-muted">Proxima etapa: centralizar comentarios por aula e modulo.</p></section> : null}
    </main>
  );
}
