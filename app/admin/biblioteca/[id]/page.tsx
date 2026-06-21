import {
  BarChart3,
  BookOpen,
  CheckSquare,
  Eye,
  FilePlus2,
  Folder,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Plus,
  Settings,
  Star,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const adminNav = [
  { href: '/admin', label: 'Resumo', icon: LayoutDashboard },
  { href: '/admin/biblioteca', label: 'Biblioteca', icon: Folder, active: true },
  { href: '/admin/alunos', label: 'Alunos', icon: Users },
  { href: '/admin/comunidade', label: 'Comunidade', icon: Users },
  { href: '/admin/avaliacoes', label: 'Avaliações', icon: Star },
  { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];

export default async function AdminModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: module }, { data: exercises }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).single(),
    supabase.from('exercises').select('*').eq('module_id', id).order('sort_order'),
  ]);

  const moduleTitle = module?.title || 'Módulo';
  const moduleDescription = module?.description || 'Edite os títulos, organize aulas e envie conteúdos do Drive para este módulo.';
  const coverUrl = String(module?.cover_url || '').trim();
  const studentUrl = `/aluno/biblioteca/${module?.slug || ''}`;
  const importUrl = `/admin/conteudos/selecionar-drive?module=${id}`;

  return (
    <main className="premium-admin-module-page">
      <aside className="premium-admin-sidebar">
        <a className="premium-admin-logo" href="/admin">
          <span>▥</span>
          <div><strong>FOCO</strong><small>EM CANTO</small></div>
        </a>

        <nav className="premium-admin-nav">
          {adminNav.map((item) => {
            const Icon = item.icon;
            return <a className={item.active ? 'active' : ''} href={item.href} key={item.label}><Icon size={20} /> {item.label}</a>;
          })}
        </nav>

        <div className="premium-admin-plan-card">
          <span>Plano atual</span>
          <strong>PROFESSOR</strong>
          <p>Acesso completo</p>
          <a href="/admin">Ver painel</a>
        </div>

        <div className="premium-admin-profile">
          <span>MC</span>
          <div><strong>Marcos Cruz</strong><small>Professor</small></div>
        </div>
      </aside>

      <section className="premium-admin-main">
        <header className="premium-admin-topbar">
          <a className="premium-admin-ghost" href="/admin/biblioteca">← Voltar para biblioteca</a>
          <div>
            <a className="premium-admin-ghost" href={studentUrl}><Eye size={16} /> Visualizar módulo</a>
            <a className="premium-admin-primary" href={studentUrl}><BookOpen size={16} /> Ver como aluno</a>
            <a className="premium-admin-icon" href="/admin"><HelpCircle size={18} /></a>
          </div>
        </header>

        <section className="premium-admin-hero-row">
          <div className="premium-admin-hero-copy">
            <p className="eyebrow">Módulo</p>
            <div className="premium-admin-title-row"><h1>{moduleTitle}</h1><span><Pencil size={18} /></span></div>
            <p>{moduleDescription}</p>
            <small>Capas recomendadas: módulo 320x480, thumbnail de aula 1280x720.</small>
            <nav className="premium-admin-tabs">
              <a className="active" href="/admin/biblioteca">Biblioteca</a>
              <a href={importUrl}>Importar do Drive</a>
              <a href={studentUrl}>Ver aluno</a>
            </nav>
          </div>

          <div className="premium-cover-panel">
            <div className="premium-cover-preview">
              {coverUrl ? <img src={coverUrl} alt="Capa do módulo" /> : null}
              <div className="premium-cover-shade" />
              <div className="premium-cover-copy">
                <span>Segunda voz</span>
                <strong>{moduleTitle}</strong>
                <p>Domine a técnica, explore sua harmonia.</p>
              </div>
            </div>

            <form className="premium-cover-actions" action={`/admin/biblioteca/${id}/salvar`} method="post" encType="multipart/form-data">
              <input type="hidden" name="title" value={moduleTitle} />
              <input type="hidden" name="description" value={module?.description || ''} />
              <input type="hidden" name="sort_order" value={module?.sort_order || 1} />
              <input type="hidden" name="cover_url" value={coverUrl} />
              <label className="premium-cover-button"><Upload size={16} /> Alterar capa<input name="cover_file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
              <button className="premium-cover-remove" name="remove_cover" value="1" type="submit"><Trash2 size={16} /> Remover capa</button>
              <button className="premium-cover-save" type="submit">Salvar capa</button>
            </form>
          </div>
        </section>

        <section className="premium-admin-stats">
          <article><Folder size={30} /><span>Importação do Drive</span><strong>Módulo → Drive</strong><p>Entre na pasta certa e importe apenas os arquivos deste módulo.</p><a href={importUrl}>Selecionar pasta ou arquivo</a></article>
          <article><ListChecks size={30} /><span>Conteúdos</span><strong>{exercises?.length || 0}</strong><p>Aulas e exercícios neste módulo.</p></article>
          <article><FilePlus2 size={30} /><span>Capas</span><strong>320x480</strong><p>Proporção ideal para cards verticais premium.</p></article>
        </section>

        <section className="premium-admin-edit-grid">
          <article className="premium-admin-card">
            <p className="eyebrow">Editar módulo</p>
            <h2>Dados principais</h2>
            <form className="admin-form" action={`/admin/biblioteca/${id}/salvar`} method="post" encType="multipart/form-data">
              <label>Título<input name="title" defaultValue={moduleTitle} required /></label>
              <label>Descrição<textarea name="description" defaultValue={module?.description || ''} /></label>
              <label>Ordem<input name="sort_order" type="number" defaultValue={module?.sort_order || 1} /></label>
              <label>Capa do módulo <small className="muted">Proporção ideal: 320x480</small><input name="cover_file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
              <label>URL da capa <small className="muted">Opcional</small><input name="cover_url" defaultValue={coverUrl} placeholder="Cole a URL da capa" /></label>
              <button className="premium-admin-primary" type="submit">Salvar módulo</button>
            </form>
          </article>

          <article className="premium-admin-card">
            <p className="eyebrow">Nova aula manual</p>
            <h2>Adicionar conteúdo</h2>
            <form className="admin-form" action="/admin/conteudos/criar" method="post">
              <input type="hidden" name="module_id" value={id} />
              <label>Título<input name="title" required placeholder="Ex: Aula 01 - Segunda voz" /></label>
              <div className="admin-form-grid">
                <label>Tipo<select name="media_type" defaultValue="video"><option value="video">Aula em vídeo</option><option value="audio">Exercício em áudio</option><option value="dueto">Dueto</option></select></label>
                <label>Nível<select name="difficulty" defaultValue="1"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label>
              </div>
              <label>Link Drive<input name="drive_url" placeholder="Cole o arquivo do Drive" /></label>
              <label>Descrição<textarea name="description" /></label>
              <label>Objetivo<textarea name="objective" /></label>
              <button className="premium-admin-primary" type="submit"><Plus size={16} /> Adicionar</button>
            </form>
          </article>
        </section>

        <section className="premium-lessons-board">
          <div className="premium-lessons-head">
            <div><p className="eyebrow">Aulas e exercícios</p><h2>Gerencie os conteúdos</h2><p>Edite títulos, visualize aulas, exclua envios errados e mantenha o módulo organizado.</p></div>
            <div><a href={importUrl}><Upload size={16} /> Importar do Drive</a><button form="bulk-delete-lessons" type="submit"><Trash2 size={16} /> Excluir selecionadas</button></div>
          </div>

          <form id="bulk-delete-lessons" action={`/admin/biblioteca/${id}/aulas/excluir`} method="post">
            <div className="premium-lessons-list">
              {(exercises || []).map((exercise: any, index: number) => (
                <article className="premium-lesson-admin-row" key={exercise.id}>
                  <label className="premium-check-input"><input type="checkbox" name="lesson_id" value={exercise.id} /></label>
                  <div className="premium-admin-lesson-thumb"><strong>{String(index + 1).padStart(2, '0')}</strong><span>▶</span></div>
                  <div className="premium-admin-lesson-info">
                    <span className="pill">{String(exercise.media_type || 'video').toUpperCase()} · NÍVEL {exercise.difficulty || 1}</span>
                    <form className="inline-title-form" action={`/admin/biblioteca/${id}/aulas/renomear`} method="post">
                      <input type="hidden" name="lesson_id" value={exercise.id} />
                      <input name="title" defaultValue={exercise.title} aria-label="Título da aula" />
                      <button type="submit">Salvar</button>
                    </form>
                    <p>{exercise.description || 'Sem descrição'}</p>
                  </div>
                  <div className="premium-admin-lesson-actions">
                    <a href={`/aluno/aula/${exercise.slug}`}><Eye size={16} /> Ver aula</a>
                    <a href={`/admin/conteudos/exercicios/${exercise.id}/editar`}><Pencil size={16} /> Editar</a>
                    <span><CheckSquare size={16} /></span>
                  </div>
                </article>
              ))}
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
