import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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

  revalidatePath('/admin');
  revalidatePath('/admin/cursos');
  revalidatePath(`/admin/cursos/${id}`);
}

async function createModule(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const courseId = String(formData.get('course_id') || '');
  const title = String(formData.get('title') || '').trim();
  if (!courseId || !title) return;

  await supabase.from('course_modules').insert({
    course_id: courseId,
    title,
    description: String(formData.get('description') || '').trim(),
    sort_order: Number(formData.get('sort_order') || 0),
    is_active: true,
  });

  revalidatePath('/admin');
  revalidatePath(`/admin/cursos/${courseId}`);
}

async function createLesson(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const courseId = String(formData.get('course_id') || '');
  const moduleId = String(formData.get('module_id') || '');
  const title = String(formData.get('title') || '').trim();
  if (!courseId || !moduleId || !title) return;

  await supabase.from('lessons').insert({
    module_id: moduleId,
    title,
    slug: String(formData.get('slug') || '').trim(),
    description: String(formData.get('description') || '').trim(),
    video_url: String(formData.get('video_url') || '').trim(),
    cover_url: String(formData.get('cover_url') || '').trim(),
    lesson_type: String(formData.get('lesson_type') || 'lesson'),
    allow_submission: formData.get('allow_submission') === 'on',
    allow_community_post: formData.get('allow_community_post') === 'on',
    sort_order: Number(formData.get('sort_order') || 0),
    is_active: true,
  });

  revalidatePath('/admin');
  revalidatePath(`/admin/cursos/${courseId}`);
}

export default async function CourseManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: course }, { data: products }, { data: modules }] = await Promise.all([
    supabase.from('courses').select('*,products(id,name)').eq('id', id).maybeSingle(),
    supabase.from('products').select('id,name').order('created_at'),
    supabase.from('course_modules').select('id,title,description,sort_order,is_active,lessons(id,title,lesson_type,sort_order,allow_submission,allow_community_post,is_active)').eq('course_id', id).order('sort_order', { ascending: true }),
  ]);

  if (!course) {
    return <main className="page admin-shell"><section className="card"><h1>Curso não encontrado</h1><a className="button" href="/admin/cursos">Voltar</a></section></main>;
  }

  const product = relatedProduct(course.products);

  return (
    <main className="page admin-shell school-admin-shell">
      <section className="admin-hero school-hero compact-hero">
        <div>
          <p className="eyebrow">Gerenciar curso</p>
          <h1>{course.title}</h1>
          <p className="muted">{product?.name ? `Liberado por: ${product.name}` : 'Curso ainda sem produto de acesso vinculado.'}</p>
        </div>
        <a className="button secondary premium-button" href="/admin/cursos">Voltar</a>
      </section>

      <section className="school-two-column">
        <div className="stack">
          <form className="card premium-panel premium-form" action={updateCourse}>
            <input type="hidden" name="id" value={course.id} />
            <p className="eyebrow">Vitrine do curso</p>
            <h2>Dados principais</h2>
            <label><span>Produto que libera acesso</span><select name="product_id" defaultValue={course.product_id || ''}><option value="">Selecionar produto</option>{(products || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>Título</span><input name="title" defaultValue={course.title || ''} required /></label>
            <label><span>Slug</span><input name="slug" defaultValue={course.slug || ''} required /></label>
            <label><span>Subtítulo</span><input name="subtitle" defaultValue={course.subtitle || ''} /></label>
            <label><span>Descrição</span><textarea name="description" defaultValue={course.description || ''} /></label>
            <div className="form-grid-two">
              <label><span>Status</span><select name="status" defaultValue={course.status || 'draft'}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></select></label>
              <label><span>Nível</span><input name="level" defaultValue={course.level || ''} placeholder="Iniciante, intermediário..." /></label>
            </div>
            <label><span>Duração estimada</span><input name="estimated_duration" defaultValue={course.estimated_duration || ''} placeholder="Ex: 8 módulos" /></label>
            <label><span>URL da capa</span><input name="cover_url" defaultValue={course.cover_url || ''} /></label>
            <label><span>Trailer / vídeo de apresentação</span><input name="trailer_url" defaultValue={course.trailer_url || ''} /></label>
            <button className="button premium-button submit-glow" type="submit">Salvar curso</button>
          </form>

          <section className="card premium-panel">
            <div className="section-heading">
              <div><p className="eyebrow">Conteúdo</p><h2>Módulos e aulas</h2></div>
            </div>
            <div className="admin-list">
              {(modules || []).length ? (modules || []).map((module: any) => (
                <article className="module-board-card" key={module.id}>
                  <div className="module-board-head">
                    <div><span className="pill">Ordem {module.sort_order || 0}</span><h3>{module.title}</h3><p className="muted">{module.description || 'Sem descrição.'}</p></div>
                  </div>
                  <div className="lesson-mini-list">
                    {((module.lessons || []) as any[]).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((lesson) => (
                      <div className="lesson-mini-row" key={lesson.id}>
                        <span>{lesson.lesson_type}</span>
                        <strong>{lesson.title}</strong>
                        <small>{lesson.allow_submission ? 'Com envio' : 'Sem envio'} · {lesson.allow_community_post ? 'Comunidade' : 'Privado'}</small>
                      </div>
                    ))}
                    {!(module.lessons || []).length ? <p className="muted">Nenhuma aula cadastrada neste módulo.</p> : null}
                  </div>
                </article>
              )) : <div className="empty-premium-state"><strong>Nenhum módulo ainda.</strong><p className="muted">Crie o primeiro módulo para começar a montar a experiência.</p></div>}
            </div>
          </section>
        </div>

        <aside className="stack sticky-panel">
          <form className="card premium-panel premium-form" action={createModule}>
            <input type="hidden" name="course_id" value={course.id} />
            <p className="eyebrow">Novo módulo</p>
            <h2>Criar módulo</h2>
            <label><span>Título</span><input name="title" placeholder="Ex: Primeiros duetos" required /></label>
            <label><span>Descrição</span><textarea name="description" placeholder="Explique o objetivo do módulo." /></label>
            <label><span>Ordem</span><input name="sort_order" type="number" defaultValue="0" /></label>
            <button className="button premium-button submit-glow" type="submit">Adicionar módulo</button>
          </form>

          <form className="card premium-panel premium-form" action={createLesson}>
            <input type="hidden" name="course_id" value={course.id} />
            <p className="eyebrow">Nova aula</p>
            <h2>Criar aula ou atividade</h2>
            <label><span>Módulo</span><select name="module_id" defaultValue="" required><option value="">Selecionar módulo</option>{(modules || []).map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label>
            <label><span>Título</span><input name="title" placeholder="Ex: Treino de segunda voz" required /></label>
            <label><span>Slug</span><input name="slug" placeholder="treino-segunda-voz" /></label>
            <label><span>Descrição</span><textarea name="description" placeholder="Orientações para o aluno." /></label>
            <div className="form-grid-two">
              <label><span>Tipo</span><select name="lesson_type" defaultValue="lesson"><option value="lesson">Aula</option><option value="activity">Atividade</option><option value="material">Material</option><option value="live">Ao vivo</option></select></label>
              <label><span>Ordem</span><input name="sort_order" type="number" defaultValue="0" /></label>
            </div>
            <label><span>URL do vídeo</span><input name="video_url" placeholder="https://..." /></label>
            <label><span>URL da capa</span><input name="cover_url" placeholder="https://..." /></label>
            <label className="premium-check"><input type="checkbox" name="allow_submission" /> Permitir envio de atividade</label>
            <label className="premium-check"><input type="checkbox" name="allow_community_post" /> Permitir publicar na comunidade</label>
            <button className="button premium-button submit-glow" type="submit">Adicionar aula</button>
          </form>
        </aside>
      </section>
    </main>
  );
}
