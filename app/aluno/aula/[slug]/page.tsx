import { ContentPlayer } from '@/components/content-player';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function driveThumb(url?: string | null) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w320` : '';
}

function isRealModule(module: any) {
  const description = String(module.description || '').toLowerCase();
  const title = String(module.title || '').toLowerCase();
  return description.indexOf('importados da pasta') === -1 && title !== 'biblioteca geral';
}

function cleanDescription(text?: string | null) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.toLowerCase().includes('material importado do google drive')) return '';
  return value;
}

export default async function StudentLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: lesson } = await supabase
    .from('exercises')
    .select('id,title,slug,description,objective,media_type,difficulty,drive_url,media_url,audio_url,module_id,modules(title,slug,description)')
    .eq('slug', slug)
    .single();

  const module = Array.isArray(lesson?.modules) ? lesson?.modules[0] : lesson?.modules;

  const [{ data: rawModules }, { data: currentModuleLessons }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,sort_order,exercises(id,title,slug,drive_url,media_url,thumbnail_url,sort_order)').eq('is_active', true).order('sort_order'),
    lesson?.module_id ? supabase.from('exercises').select('id,title,slug,drive_url,media_url,thumbnail_url,sort_order').eq('module_id', lesson.module_id).order('sort_order') : { data: [] },
  ]);

  const modules = (rawModules || []).filter(isRealModule);
  const currentIndex = (currentModuleLessons || []).findIndex((item: any) => item.slug === lesson?.slug);
  const previousLesson = currentIndex > 0 ? currentModuleLessons?.[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentModuleLessons && currentIndex < currentModuleLessons.length - 1 ? currentModuleLessons[currentIndex + 1] : null;
  const description = cleanDescription(lesson?.description) || cleanDescription(module?.description) || 'Assista à referência e pratique junto. Quando estiver pronto, grave sua resposta para avaliação.';

  return (
    <main className="course-watch-page hub-watch-page">
      <section className="course-main">
        <header className="course-topbar hub-topbar">
          <a href={module?.slug ? `/aluno/biblioteca/${module.slug}` : '/aluno/biblioteca'}>← Voltar ao módulo</a>
          <strong>{module?.title || 'Biblioteca VIP'}</strong>
        </header>

        <div className="course-player-wrap hub-player-wrap">
          <ContentPlayer title={lesson?.title || 'Conteudo'} mediaType={lesson?.media_type} mediaUrl={lesson?.media_url || lesson?.audio_url} driveUrl={lesson?.drive_url} />
        </div>

        <section className="course-details hub-lesson-details">
          <div>
            <p className="course-breadcrumb">Hub VIP › {module?.title || 'Módulo'}</p>
            <h1>{lesson?.title || 'Aula'}</h1>
            <p>{description}</p>
            <div className="lesson-action-row">
              <a className="button" href={`/aluno/atividade/${lesson?.slug || ''}`}>Realizar atividade</a>
              <span className="muted">Use fone para ouvir a referência e captar melhor sua voz.</span>
            </div>
          </div>
          <div className="course-nav-buttons">
            {previousLesson ? <a className="course-square" href={`/aluno/aula/${previousLesson.slug}`}>‹</a> : <span className="course-square disabled">‹</span>}
            {nextLesson ? <a className="course-square" href={`/aluno/aula/${nextLesson.slug}`}>›</a> : <span className="course-square disabled">›</span>}
          </div>
        </section>
      </section>

      <aside className="course-sidebar hub-sidebar">
        <div className="course-sidebar-header">
          <a href="/aluno/biblioteca">← Módulos</a>
          <a href="/aluno">×</a>
        </div>
        <div className="course-module-list">
          {modules.map((mod: any) => {
            const lessons = (mod.exercises || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
            return (
              <section className="course-module-group" key={mod.id}>
                <div className="course-module-title">
                  <strong>{mod.title}</strong>
                  <span>{lessons.length} aulas</span>
                </div>
                <div className="course-lessons-list">
                  {lessons.map((item: any) => {
                    const thumb = item.thumbnail_url || driveThumb(item.drive_url || item.media_url);
                    const active = item.slug === lesson?.slug;
                    return (
                      <a className={active ? 'course-lesson-item active' : 'course-lesson-item'} href={`/aluno/aula/${item.slug}`} key={item.id}>
                        <span className="course-check">{active ? '✓' : ''}</span>
                        <span className="course-thumb">{thumb ? <img src={thumb} alt="" /> : null}</span>
                        <span>{item.title}</span>
                      </a>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </aside>
    </main>
  );
}
