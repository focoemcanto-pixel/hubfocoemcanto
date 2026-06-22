import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type AnyRow = any;
type Product = { id: string; name: string };

function relatedProduct(value: unknown): Product | null {
  if (Array.isArray(value)) return (value[0] || null) as Product | null;
  return (value || null) as Product | null;
}

async function updateCourse(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const id = String(formData.get('id') || '');
  if (!id) return;
  await supabase.from('courses').update({
    title: String(formData.get('title') || '').trim(),
    slug: String(formData.get('slug') || '').trim(),
    subtitle: String(formData.get('subtitle') || '').trim(),
    description: String(formData.get('description') || '').trim(),
    cover_url: String(formData.get('cover_url') || '').trim(),
    trailer_url: String(formData.get('trailer_url') || '').trim(),
    level: String(formData.get('level') || '').trim(),
    estimated_duration: String(formData.get('estimated_duration') || '').trim(),
    status: String(formData.get('status') || 'draft'),
    product_id: String(formData.get('product_id') || '') || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  revalidatePath('/admin/cursos');
  revalidatePath(`/admin/cursos/${id}`);
}

async function syncCourseModules(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const courseId = String(formData.get('course_id') || '');
  const moduleIds = formData.getAll('module_id').map((value) => String(value)).filter(Boolean);
  if (!courseId) return;

  await supabase.from('course_module_links').delete().eq('course_id', courseId);
  if (moduleIds.length) {
    await supabase.from('course_module_links').insert(moduleIds.map((moduleId, index) => ({ course_id: courseId, module_id: moduleId, sort_order: index + 1 })));
  }

  revalidatePath('/admin/cursos');
  revalidatePath(`/admin/cursos/${courseId}`);
}

export default async function CourseManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [courseResult, productsResult, modulesResult, linksResult] = await Promise.all([
    supabase.from('courses').select('*,products(id,name)').eq('id', id).maybeSingle(),
    supabase.from('products').select('id,name').order('created_at'),
    supabase.from('modules').select('id,title,slug,description,sort_order,storage_provider,exercises(id)').neq('is_active', false).order('sort_order', { ascending: true }),
    supabase.from('course_module_links').select('module_id,sort_order').eq('course_id', id).order('sort_order', { ascending: true }),
  ]);

  const course = courseResult.data;
  if (!course) return <main className="page admin-shell"><section className="card"><h1>Curso não encontrado</h1><a className="button" href="/admin/cursos">Voltar</a></section></main>;

  const products = (productsResult.data || []) as AnyRow[];
  const allModules = (modulesResult.data || []) as AnyRow[];
  const selectedIds = new Set(((linksResult.data || []) as AnyRow[]).map((link) => link.module_id));
  const selectedModules = allModules.filter((module) => selectedIds.has(module.id));
  const product = relatedProduct(course.products);

  return (
    <main className="page admin-shell school-admin-shell">
      <section className="admin-hero school-hero compact-hero">
        <div><p className="eyebrow">Curso da escola</p><h1>{course.title}</h1><p className="muted">{product?.name ? `Liberado por: ${product.name}` : 'Curso ainda sem produto vinculado.'}</p></div>
        <a className="button secondary premium-button" href="/admin/cursos">Voltar</a>
      </section>

      <section className="school-two-column">
        <div className="stack">
          <form className="card premium-panel premium-form" action={updateCourse}>
            <input type="hidden" name="id" value={course.id} />
            <p className="eyebrow">Vitrine do curso</p><h2>Dados principais</h2>
            <label><span>Produto que libera acesso</span><select name="product_id" defaultValue={course.product_id || ''}><option value="">Selecionar produto</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>Título</span><input name="title" defaultValue={course.title || ''} required /></label>
            <label><span>Slug</span><input name="slug" defaultValue={course.slug || ''} required /></label>
            <label><span>Subtítulo</span><input name="subtitle" defaultValue={course.subtitle || ''} /></label>
            <label><span>Descrição</span><textarea name="description" defaultValue={course.description || ''} /></label>
            <div className="form-grid-two"><label><span>Status</span><select name="status" defaultValue={course.status || 'draft'}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></select></label><label><span>Nível</span><input name="level" defaultValue={course.level || ''} /></label></div>
            <label><span>Duração estimada</span><input name="estimated_duration" defaultValue={course.estimated_duration || ''} placeholder="Ex: 8 módulos" /></label>
            <label><span>URL da capa</span><input name="cover_url" defaultValue={course.cover_url || ''} /></label>
            <label><span>Trailer / vídeo de apresentação</span><input name="trailer_url" defaultValue={course.trailer_url || ''} /></label>
            <button className="button premium-button submit-glow" type="submit">Salvar curso</button>
          </form>

          <section className="card premium-panel">
            <div className="section-heading"><div><p className="eyebrow">Módulos vinculados</p><h2>Conteúdo do curso</h2><p className="muted">Este curso usa os módulos da Biblioteca. O motor de Drive continua dentro de cada módulo.</p></div></div>
            <div className="admin-list">
              {selectedModules.length ? selectedModules.map((module, index) => (
                <article className="module-board-card" key={module.id}>
                  <div className="module-board-head"><div><span className="pill">{index + 1} · {module.storage_provider || 'drive'}</span><h3>{module.title}</h3><p className="muted">{module.description || 'Sem descrição.'}</p></div><a className="button secondary premium-button" href={`/admin/biblioteca/${module.id}`}>Gerenciar módulo</a></div>
                </article>
              )) : <div className="empty-premium-state"><strong>Nenhum módulo vinculado.</strong><p className="muted">Selecione os módulos da Biblioteca no painel ao lado.</p></div>}
            </div>
          </section>
        </div>

        <aside className="stack sticky-panel">
          <form className="card premium-panel premium-form" action={syncCourseModules}>
            <input type="hidden" name="course_id" value={course.id} />
            <p className="eyebrow">Biblioteca</p><h2>Vincular módulos</h2>
            <div className="course-module-picker">
              {allModules.map((module) => <label className="premium-check" key={module.id}><input type="checkbox" name="module_id" value={module.id} defaultChecked={selectedIds.has(module.id)} /><span>{module.title}</span></label>)}
            </div>
            <button className="button premium-button submit-glow" type="submit">Salvar módulos do curso</button>
          </form>
        </aside>
      </section>
    </main>
  );
}
