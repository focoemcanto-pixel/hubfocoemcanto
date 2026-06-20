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

function realModule(module: any) {
  const description = String(module.description || '').toLowerCase();
  return description.indexOf('importados da pasta') === -1;
}

export default async function StudentModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: module } = await supabase.from('modules').select('id,title,slug,description').eq('slug', slug).single();
  const [{ data: lessons }, { data: rawModules }] = await Promise.all([
    module ? supabase.from('exercises').select('id,title,slug,description,media_type,difficulty,sort_order,drive_url,media_url,thumbnail_url').eq('module_id', module.id).eq('is_active', true).order('sort_order') : { data: [] },
    supabase.from('modules').select('id,title,slug,description,sort_order,exercises(id,title,slug,drive_url,media_url,thumbnail_url,sort_order)').eq('is_active', true).order('sort_order'),
  ]);

  const firstLesson = lessons?.[0];
  const modules = (rawModules || []).filter(realModule);

  return (
    <main className="course-watch-page module-watch-page">
      <section className="course-main">
        <header className="course-topbar">
          <a href="/aluno/biblioteca">← Ver todos os módulos</a>
          <strong>{module?.title || 'Biblioteca VIP'}</strong>
        </header>

        <div className="course-player-wrap">
          {firstLesson ? (
            <ContentPlayer title={firstLesson.title} mediaType={firstLesson.media_type} mediaUrl={firstLesson.media_url} driveUrl={firstLesson.drive_url} />
          ) : (
            <div className="empty-module-player"><h1>{module?.title}</h1><p>Nenhuma aula publicada neste módulo.</p></div>
          )}
        </div>

        <section className="course-details">
          <div>
            <p className="course-breadcrumb">Início › {module?.title || 'Módulo'}</p>
            <h1>{firstLesson?.title || module?.title || 'Módulo'}</h1>
            <p>{firstLesson?.description || module?.description}</p>
            <p className="muted">As aulas deste módulo ficam listadas à direita. Abra qualquer aula ou avance para a próxima.</p>
            {firstLesson ? <a className="button" href={`/aluno/aula/${firstLesson.slug}`}>Abrir aula completa</a> : null}
          </div>
          <div className="course-nav-buttons">
            {firstLesson ? <a className="course-square" href={`/aluno/aula/${firstLesson.slug}`}>›</a> : <span className="course-square disabled">›</span>}
          </div>
        </section>
      </section>

      <aside className="course-sidebar">
        <div className="course-sidebar-header">
          <a href="/aluno/biblioteca">← Ver todos os módulos</a>
          <a href="/aluno">×</a>
        </div>
        <div className="course-module-list">
          {modules.map((mod: any) => {
            const items = (mod.exercises || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
            return (
              <section className="course-module-group" key={mod.id}>
                <div className="course-module-title">
                  <strong>{mod.title}</strong>
                  <span>{items.length} aulas</span>
                </div>
                <div className="course-lessons-list">
                  {items.map((item: any) => {
                    const thumb = item.thumbnail_url || driveThumb(item.drive_url || item.media_url);
                    const active = item.slug === firstLesson?.slug;
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
