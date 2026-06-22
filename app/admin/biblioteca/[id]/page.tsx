import {
  BookOpen,
  Eye,
  FilePlus2,
  Folder,
  Link as LinkIcon,
  ListChecks,
  Plus,
  Trash2,
} from 'lucide-react';
import { AdminInlineModuleTitle } from '@/components/admin-inline-module-title';
import { AdminLessonTitleEditor } from '@/components/admin-lesson-title-editor';
import { AdminLoadingLink } from '@/components/admin-loading-link';
import { AdminModuleCoverUploader } from '@/components/admin-module-cover-uploader';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Search = { product?: string };

export default async function AdminModulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Search> }) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const supabase = createAdminClient();
  const [{ data: module }, { data: exercises }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).single(),
    supabase.from('exercises').select('*').eq('module_id', id).order('sort_order'),
  ]);

  const moduleTitle = module?.title || 'Módulo';
  const moduleDescription = module?.description || 'Edite os títulos, organize aulas e envie conteúdos do Drive para este módulo.';
  const coverUrl = String(module?.cover_url || '').trim();
  const storageProvider = String(module?.storage_provider || 'drive');
  const studentUrl = `/aluno/biblioteca/${module?.slug || ''}`;
  const importUrl = `/admin/conteudos/selecionar-drive?module=${id}`;
  const backUrl = query.product ? `/admin/produtos/${query.product}?tab=conteudo` : '/admin/produtos';

  return (
    <main className="premium-admin-module-page module-settings-page">
      <section className="premium-admin-main module-settings-main">
        <header className="premium-admin-topbar module-settings-topbar">
          <a className="premium-admin-ghost" href={backUrl}>← Voltar para o produto</a>
          <div><a className="premium-admin-ghost" href={studentUrl}><Eye size={16} /> Visualizar módulo</a><a className="premium-admin-primary" href={studentUrl}><BookOpen size={16} /> Ver como aluno</a></div>
        </header>

        <section className="premium-admin-hero-row">
          <div className="premium-admin-hero-copy">
            <p className="eyebrow">Configurações do módulo · {storageProvider.toUpperCase()}</p>
            <AdminInlineModuleTitle moduleId={id} initialTitle={moduleTitle} />
            <p>{moduleDescription}</p>
            <small>Capas recomendadas: módulo 320x480, thumbnail de aula 1280x720.</small>
            <nav className="premium-admin-tabs"><a className="active" href="#dados">Dados do módulo</a><AdminLoadingLink href={importUrl} loadingLabel="Abrindo Drive...">Importar do Drive</AdminLoadingLink><a href={studentUrl}>Ver aluno</a></nav>
          </div>
          <div className="premium-cover-panel">
            <AdminModuleCoverUploader moduleId={id} title={moduleTitle} description={module?.description || ''} sortOrder={module?.sort_order || 1} initialCoverUrl={coverUrl} />
          </div>
        </section>

        <section className="premium-admin-stats">
          <article><Folder size={30} /><span>Origem do conteúdo</span><strong>{storageProvider === 'r2' ? 'Cloudflare R2' : 'Google Drive'}</strong><p>{storageProvider === 'r2' ? 'Preparado para receber vídeos hospedados no R2.' : 'Entre na pasta certa e importe apenas os arquivos deste módulo.'}</p><AdminLoadingLink href={importUrl} loadingLabel="Abrindo Drive...">Selecionar pasta ou arquivo</AdminLoadingLink></article>
          <article><ListChecks size={30} /><span>Conteúdos</span><strong>{exercises?.length || 0}</strong><p>Aulas e exercícios neste módulo.</p></article>
          <article><FilePlus2 size={30} /><span>Capas</span><strong>320x480</strong><p>Proporção ideal para cards verticais premium.</p></article>
        </section>

        <section id="dados" className="module-accordion-area">
          <input id="toggle-module-data" className="admin-hidden-toggle" type="checkbox" />
          <input id="toggle-manual-lesson" className="admin-hidden-toggle" type="checkbox" />
          <div className="module-settings-actions">
            <label className="admin-clean-button primary" htmlFor="toggle-module-data">Editar dados do módulo</label>
            <label className="admin-clean-button secondary" htmlFor="toggle-manual-lesson">Adicionar aula manual</label>
          </div>

          <div className="module-collapsible module-data-panel">
            <article className="premium-admin-card">
              <p className="eyebrow">Editar módulo</p><h2>Dados principais</h2>
              <form className="admin-form" action={`/admin/biblioteca/${id}/salvar`} method="post" encType="multipart/form-data">
                <label>Título<input name="title" defaultValue={moduleTitle} required /></label>
                <label>Descrição<textarea name="description" defaultValue={module?.description || ''} /></label>
                <label>Ordem<input name="sort_order" type="number" defaultValue={module?.sort_order || 1} /></label>
                <div className="admin-form-grid"><label>Origem<select name="storage_provider" defaultValue={storageProvider}><option value="drive">Google Drive</option><option value="r2">Cloudflare R2</option></select></label><label>Prefixo R2<input name="r2_prefix" defaultValue={module?.r2_prefix || ''} placeholder="foco-harmonia/modulo-01" /></label></div>
                <label>Capa do módulo <small className="muted">Proporção ideal: 320x480</small><input name="cover_file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
                <label>URL da capa <small className="muted">Opcional</small><input name="cover_url" defaultValue={coverUrl} placeholder="Cole a URL da capa" /></label>
                <button className="premium-admin-primary" type="submit">Salvar módulo</button>
              </form>
            </article>
          </div>

          <div className="module-collapsible module-lesson-panel">
            <article className="premium-admin-card">
              <p className="eyebrow">Nova aula manual</p><h2>Adicionar conteúdo</h2>
              <form className="admin-form" action="/admin/conteudos/criar" method="post">
                <input type="hidden" name="module_id" value={id} />
                <label>Título<input name="title" required placeholder="Ex: Aula 01 - Segunda voz" /></label>
                <div className="admin-form-grid"><label>Tipo<select name="media_type" defaultValue="video"><option value="video">Aula em vídeo</option><option value="audio">Exercício em áudio</option><option value="dueto">Dueto</option></select></label><label>Nível<select name="difficulty" defaultValue="1"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label></div>
                <label>Link Drive ou URL R2<input name="drive_url" placeholder="Cole o arquivo do Drive ou URL assinada/R2" /></label>
                <label>Descrição<textarea name="description" /></label><label>Objetivo<textarea name="objective" /></label>
                <button className="premium-admin-primary" type="submit"><Plus size={16} /> Adicionar</button>
              </form>
            </article>
          </div>
        </section>

        <section className="premium-lessons-board premium-lessons-board-refined">
          <div className="premium-lessons-head premium-lessons-head-refined"><div><p className="eyebrow">Aulas e exercícios</p><h2>Gerencie os conteúdos</h2><p>Renomeie como no computador: editou, salvou e continua no mesmo lugar.</p></div><div><AdminLoadingLink href={importUrl} loadingLabel="Abrindo Drive..."><Plus size={16} /> Adicionar vídeo</AdminLoadingLink><button form="bulk-delete-lessons" type="submit"><Trash2 size={16} /> Excluir selecionadas</button></div></div>
          <form id="bulk-delete-lessons" action={`/admin/biblioteca/${id}/aulas/excluir`} method="post">
            <div className="premium-lessons-list premium-lessons-list-refined">
              {(exercises || []).map((exercise: any, index: number) => {
                const thumb = String(exercise.thumbnail_url || '').trim();
                return <article className="premium-lesson-admin-row premium-lesson-admin-row-refined" key={exercise.id}><label className="premium-check-input premium-check-input-refined"><input type="checkbox" name="lesson_id" value={exercise.id} /></label><div className="premium-admin-lesson-thumb premium-admin-lesson-thumb-refined">{thumb ? <img src={thumb} alt="" /> : <><strong>{String(index + 1).padStart(2, '0')}</strong><span>▶</span></>}</div><div className="premium-admin-lesson-info premium-admin-lesson-info-refined"><span className="pill">{String(exercise.storage_provider || exercise.media_type || 'video').toUpperCase()} · NÍVEL {exercise.difficulty || 1}</span><AdminLessonTitleEditor moduleId={id} lessonId={exercise.id} initialTitle={exercise.title || ''} /><div className="premium-lesson-description-line"><LinkIcon size={14} /><span>{exercise.description || 'Sem descrição'}</span><a href={`/admin/conteudos/exercicios/${exercise.id}/editar`}>Adicionar descrição</a></div></div><div className="premium-admin-lesson-actions premium-admin-lesson-actions-refined"><a href={`/aluno/aula/${exercise.slug}`}><Eye size={16} /> Ver aula</a><a href={`/admin/conteudos/exercicios/${exercise.id}/editar`}>Editar</a><button form="bulk-delete-lessons" name="lesson_id" value={exercise.id} type="submit" className="premium-admin-delete-one" aria-label="Excluir aula"><Trash2 size={16} /></button></div></article>;
              })}
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
