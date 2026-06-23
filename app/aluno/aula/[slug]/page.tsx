import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  Flame,
  Headphones,
  HelpCircle,
  Home,
  Mic,
  Play,
  Sparkles,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { ContentPlayer } from '@/components/content-player';
import { LessonProgressButton } from '@/components/lesson-progress-button';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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

const navItems = [
  { href: '/aluno', label: 'Início', icon: Home },
  { href: '/aluno/biblioteca', label: 'Trilhas', icon: Sparkles },
  { href: '/aluno/biblioteca', label: 'Aulas', icon: Play, active: true },
  { href: '#lesson-action', label: 'Exercícios', icon: Headphones },
  { href: '#lesson-action', label: 'Enviar voz', icon: Mic },
  { href: '/aluno/comunidade', label: 'Comunidade', icon: Users },
  { href: '/aluno/perfil', label: 'Meu progresso', icon: BarChart3 },
  { href: '/aluno/perfil', label: 'Perfil', icon: User },
];

export default async function StudentLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const { data: lesson } = await supabase
    .from('exercises')
    .select('id,title,slug,description,objective,media_type,difficulty,drive_url,media_url,audio_url,module_id,modules(title,slug,description)')
    .eq('slug', slug)
    .single();

  const module = Array.isArray(lesson?.modules) ? lesson?.modules[0] : lesson?.modules;

  const { data: profile } = email
    ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
    : { data: null };

  const [{ data: rawModules }, { data: currentModuleLessons }, { data: progressRow }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,sort_order,exercises(id,title,slug,sort_order)').eq('is_active', true).order('sort_order'),
    lesson?.module_id ? supabase.from('exercises').select('id,title,slug,sort_order').eq('module_id', lesson.module_id).order('sort_order') : Promise.resolve({ data: [] }),
    profile?.id && lesson?.id ? supabase.from('lesson_progress').select('completed,last_position_seconds').eq('profile_id', profile.id).eq('exercise_id', lesson.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const modules = (rawModules || []).filter(isRealModule);
  const lessonsInCurrentModule = currentModuleLessons || [];
  const currentIndex = lessonsInCurrentModule.findIndex((item: any) => item.slug === lesson?.slug);
  const previousLesson = currentIndex > 0 ? lessonsInCurrentModule?.[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentIndex < lessonsInCurrentModule.length - 1 ? lessonsInCurrentModule[currentIndex + 1] : null;
  const currentPosition = currentIndex >= 0 ? currentIndex + 1 : 1;
  const totalLessons = lessonsInCurrentModule.length || 1;
  const progress = Math.min(100, Math.max(8, Math.round((currentPosition / totalLessons) * 100)));
  const description = cleanDescription(lesson?.description) || cleanDescription(module?.description) || 'Assista à referência e pratique junto. Quando estiver pronto, grave sua resposta para avaliação.';
  const savedPosition = Number(progressRow?.last_position_seconds || 0);
  const completed = Boolean(progressRow?.completed);

  return (
    <main className="premium-lesson-page route-surface">
      <aside className="premium-lesson-leftnav" aria-label="Navegação do aluno">
        <Link className="premium-back-link" href={module?.slug ? `/aluno/biblioteca/${module.slug}` : '/aluno/biblioteca'} prefetch>
          <ChevronLeft size={18} />
          Voltar ao módulo
        </Link>
        <nav className="premium-nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isAnchor = item.href.startsWith('#');
            return isAnchor ? <a className={item.active ? 'premium-nav-item active' : 'premium-nav-item'} href={item.href} key={item.label}><Icon size={22} /><span>{item.label}</span></a> : <Link className={item.active ? 'premium-nav-item active' : 'premium-nav-item'} href={item.href} prefetch key={item.label}><Icon size={22} /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="premium-streak-card"><Flame size={24} /><span>Sequência atual</span><strong>7 dias</strong><p>Continue firme!</p></div>
      </aside>
      <section className="premium-lesson-main">
        <header className="premium-lesson-topbar"><div /><Link className="premium-brand" href="/aluno" prefetch aria-label="Ir para o início"><span className="brand-wave">▴▾▴</span><strong>FOCO</strong><small>EM CANTO</small></Link><div className="premium-top-actions"><Link href="/aluno" prefetch><Home size={16} /> Início</Link><Link href="/aluno/perfil" prefetch><Trophy size={16} /> Conquistas</Link><a href="#lesson-notes"><HelpCircle size={16} /> Ajuda</a><Link href="/aluno/perfil" className="premium-avatar" prefetch>FC</Link></div></header>
        <div className="premium-content-grid">
          <section className="premium-watch-column">
            <p className="premium-breadcrumb"><Link href="/aluno" prefetch>Hub VIP</Link> › {module?.slug ? <Link href={`/aluno/biblioteca/${module.slug}`} prefetch>{module.title}</Link> : module?.title || 'Módulo'}</p>
            <div className="premium-player-card"><div className="premium-player-frame"><ContentPlayer title={lesson?.title || 'Conteúdo'} mediaType={lesson?.media_type} mediaUrl={lesson?.media_url || lesson?.audio_url} driveUrl={lesson?.drive_url} lessonId={lesson?.id} initialPositionSeconds={savedPosition} /></div></div>
            <section className="premium-lesson-details" id="lesson-action">
              <div className="premium-lesson-header-row"><div><p className="premium-module-label"><Sparkles size={16} /> {module?.title || 'Biblioteca VIP'}</p><h1>{lesson?.title || 'Aula'}</h1><p>{description}</p>{savedPosition > 5 && !completed ? <small className="muted">Retomando de aproximadamente {Math.floor(savedPosition / 60)}min {savedPosition % 60}s.</small> : null}</div>{lesson?.id ? <LessonProgressButton exerciseId={lesson.id} initialCompleted={completed} /> : null}</div>
              <div className="premium-progress-block"><div className="premium-progress-head"><span>Progresso do módulo</span><strong>{currentPosition} de {totalLessons} aulas</strong></div><div className="premium-progress"><span style={{ width: `${progress}%` }} /></div></div>
              <div className="premium-action-row compact"><Link className="premium-primary-button" href={`/aluno/atividade/${lesson?.slug || ''}`} prefetch><Headphones size={18} />Realizar atividade</Link><div className="premium-next-actions">{previousLesson ? <Link className="premium-round" href={`/aluno/aula/${previousLesson.slug}`} prefetch aria-label="Aula anterior"><ArrowLeft size={20} /></Link> : <span className="premium-round disabled"><ArrowLeft size={20} /></span>}{nextLesson ? <Link className="premium-round" href={`/aluno/aula/${nextLesson.slug}`} prefetch aria-label="Próxima aula"><ArrowRight size={20} /></Link> : <span className="premium-round disabled"><ArrowRight size={20} /></span>}</div></div>
              <div className="premium-tip-card" id="lesson-notes"><Sparkles size={20} /><div><strong>Dica do professor</strong><p>Use fone para ouvir a referência e captar melhor sua voz antes de gravar sua execução.</p></div></div>
            </section>
          </section>
          <aside className="premium-modules-panel">
            <div className="premium-modules-head"><Link href="/aluno/biblioteca" prefetch><ArrowLeft size={18} /> Módulos</Link><Link href="/aluno" prefetch><X size={18} /></Link></div>
            <div className="premium-module-list">{modules.map((mod: any) => { const lessons = (mod.exercises || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)); return <section className="premium-module-group" key={mod.id}><div className="premium-module-title"><strong>{mod.title}</strong><span>{lessons.length} aulas</span></div><div className="premium-lessons-list">{lessons.map((item: any, index: number) => { const active = item.slug === lesson?.slug; return <Link className={active ? 'premium-lesson-item active no-thumb' : 'premium-lesson-item no-thumb'} href={`/aluno/aula/${item.slug}`} prefetch key={item.id}><span className={active ? 'premium-check active' : 'premium-check'}>{active ? <Check size={14} /> : null}</span><span className="premium-thumb premium-generated-thumb"><span>{String(index + 1).padStart(2, '0')}</span><Play size={18} /></span><span className="premium-lesson-copy"><strong>{item.title}</strong><small>Aula {String(index + 1).padStart(2, '0')}</small></span></Link>; })}</div></section>; })}</div>
          </aside>
        </div>
      </section>
    </main>
  );
}
