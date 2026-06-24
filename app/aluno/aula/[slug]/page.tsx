import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, ArrowRight, BarChart3, Check, ChevronLeft, Flame, Headphones, HelpCircle, Home, Lock, Mic, Play, Sparkles, Trophy, User, Users, X } from 'lucide-react';
import { ContentPlayer } from '@/components/content-player';
import { DynamicBrandLogo, dynamicBrandLogoCss } from '@/components/dynamic-brand-logo';
import { focoAcademyLogoCss } from '@/components/foco-academy-logo';
import { LessonProgressButton } from '@/components/lesson-progress-button';
import { getAdminSettings } from '@/lib/data/admin-settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || 'https://pay.kiwify.com.br/HHr4eyM';
function isRealModule(module: any) { const description = String(module.description || '').toLowerCase(); const title = String(module.title || '').toLowerCase(); return description.indexOf('importados da pasta') === -1 && title !== 'biblioteca geral'; }
function cleanDescription(text?: string | null) { const value = String(text || '').trim(); if (!value) return ''; if (value.toLowerCase().includes('material importado do google drive')) return ''; return value; }
function hasVipSubscription(rows: any[]) { return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status)); }
function isFreeTuningModule(module: any) { const value = `${module?.title || ''} ${module?.slug || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return value.includes('firm') && value.includes('afin'); }
function initials(name?: string | null, email?: string | null) { return String(name || email || 'FC').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'FC'; }

function VipLessonLocked() {
  return <main className="premium-lesson-page route-surface vip-lesson-locked-page"><section className="vip-lock-backdrop static"><section className="vip-lock-modal"><div className="vip-lock-icon"><Lock size={30} /></div><p className="eyebrow"><Sparkles size={14} /> Exclusivo VIP</p><h3>Essa aula é para assinantes da Sala de Atividades VIP</h3><p>O módulo Firmando a Afinação está liberado grátis. Assine para acessar todos os módulos, downloads e avaliação do professor.</p><ul><li>Exercícios guiados</li><li>Envio para avaliação</li><li>Duetos na comunidade</li><li>Correções do professor</li></ul><a className="vip-lock-cta" href={VIP_CHECKOUT_URL}>Assinar e desbloquear agora</a><Link className="vip-lock-later" href="/aluno/biblioteca#sala-vip">Voltar para a sala VIP</Link></section></section></main>;
}

async function getProgress(supabase: ReturnType<typeof createAdminClient>, profileId?: string, lessonId?: string) {
  if (!profileId || !lessonId) return null;
  const primary = await supabase.from('lesson_progress').select('completed,last_position_seconds').eq('profile_id', profileId).eq('exercise_id', lessonId).maybeSingle();
  if (primary.data) return primary.data;
  const message = String(primary.error?.message || '').toLowerCase();
  if (!message.includes('does not exist') && !message.includes('schema cache') && !message.includes('lesson_progress')) return null;
  const legacy = await supabase.from('exercise_progress').select('completed,updated_at').eq('profile_id', profileId).eq('exercise_id', lessonId).maybeSingle();
  if (!legacy.data) return null;
  return { completed: legacy.data.completed, last_position_seconds: 0 };
}

const navItems = [
  { href: '/aluno', label: 'Início', icon: Home }, { href: '/aluno/biblioteca', label: 'Trilhas', icon: Sparkles }, { href: '/aluno/biblioteca', label: 'Aulas', icon: Play, active: true }, { href: '#lesson-action', label: 'Exercícios', icon: Headphones }, { href: '#lesson-action', label: 'Enviar voz', icon: Mic }, { href: '/aluno/comunidade', label: 'Comunidade', icon: Users }, { href: '/aluno/perfil', label: 'Meu progresso', icon: BarChart3 }, { href: '/aluno/perfil', label: 'Perfil', icon: User },
];
const vipListCss = `${focoAcademyLogoCss}${dynamicBrandLogoCss}.premium-module-group.locked-vip{position:relative;border:1px solid rgba(245,199,107,.26);border-radius:22px;background:rgba(245,199,107,.04);padding:10px}.premium-module-group.locked-vip .premium-lessons-list{opacity:.68;filter:saturate(.75)}.premium-module-group.locked-vip .premium-module-title strong{color:rgba(255,255,255,.58)}.vip-list-badge{margin-left:auto;border:1px solid rgba(245,199,107,.45);border-radius:999px;padding:5px 9px;color:#f5c76b;background:rgba(245,199,107,.1);font-size:11px;font-style:normal;font-weight:900}.premium-lesson-item.locked-vip-lesson{border:1px solid rgba(245,199,107,.14)}.premium-lesson-item.locked-vip-lesson .premium-lesson-copy small{color:#f5c76b}.premium-avatar-photo{overflow:hidden;padding:0!important}.premium-avatar-photo img,.premium-avatar-photo span{width:100%;height:100%;border-radius:inherit;object-fit:cover;display:grid;place-items:center}.premium-avatar-photo img{display:block}.premium-avatar-photo span{font-size:inherit;font-weight:inherit}.premium-brand{gap:0!important}.premium-brand .foco-academy-logo.compact svg{width:46px;height:36px}.premium-brand .dynamic-brand-logo.compact img{height:auto!important;max-width:240px}.premium-brand .brand-wave,.premium-brand .brand-fallback-text{display:none!important}`;

export default async function StudentLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const settings = await getAdminSettings();
  const { data: lesson } = await supabase.from('exercises').select('id,title,slug,description,objective,media_type,difficulty,drive_url,media_url,audio_url,module_id,trim_start_seconds,trim_end_seconds,modules(title,slug,description)').eq('slug', slug).single();
  const module = Array.isArray(lesson?.modules) ? lesson?.modules[0] : lesson?.modules;
  const { data: profile } = email ? await supabase.from('profiles').select('id,name,email,avatar_url').eq('email', email).maybeSingle() : { data: null };
  const { data: subscriptions } = profile?.id ? await supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id) : { data: [] };
  const hasVip = hasVipSubscription(subscriptions || []);
  if (!hasVip && !isFreeTuningModule(module)) return <VipLessonLocked />;

  const [{ data: rawModules }, { data: currentModuleLessons }, progressRow] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,sort_order,exercises(id,title,slug,sort_order)').eq('is_active', true).order('sort_order'),
    lesson?.module_id ? supabase.from('exercises').select('id,title,slug,sort_order').eq('module_id', lesson.module_id).order('sort_order') : Promise.resolve({ data: [] }),
    getProgress(supabase, profile?.id, lesson?.id),
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
  const avatarLabel = profile?.name || profile?.email || email || 'Perfil';

  return <main className="premium-lesson-page route-surface"><style dangerouslySetInnerHTML={{ __html: vipListCss }} /><aside className="premium-lesson-leftnav" aria-label="Navegação do aluno"><Link className="premium-back-link" href={module?.slug ? `/aluno/biblioteca/${module.slug}` : '/aluno/biblioteca'} prefetch><ChevronLeft size={18} />Voltar ao módulo</Link><nav className="premium-nav-stack">{navItems.map((item) => { const Icon = item.icon; const isAnchor = item.href.startsWith('#'); return isAnchor ? <a className={item.active ? 'premium-nav-item active' : 'premium-nav-item'} href={item.href} key={item.label}><Icon size={22} /><span>{item.label}</span></a> : <Link className={item.active ? 'premium-nav-item active' : 'premium-nav-item'} href={item.href} prefetch key={item.label}><Icon size={22} /><span>{item.label}</span></Link>; })}</nav><div className="premium-streak-card"><Flame size={24} /><span>Sequência atual</span><strong>7 dias</strong><p>Continue firme!</p></div></aside><section className="premium-lesson-main"><header className="premium-lesson-topbar"><div /><Link className="premium-brand" href="/aluno" prefetch aria-label="Ir para o início"><DynamicBrandLogo settings={settings} compact /></Link><div className="premium-top-actions"><Link href="/aluno" prefetch><Home size={16} /> Início</Link><Link href="/aluno/perfil" prefetch><Trophy size={16} /> Conquistas</Link><a href="#lesson-notes"><HelpCircle size={16} /> Ajuda</a><Link href="/aluno/perfil" className="premium-avatar premium-avatar-photo" prefetch aria-label={`Abrir perfil de ${avatarLabel}`}>{profile?.avatar_url ? <img src={profile.avatar_url} alt={avatarLabel} /> : <span>{initials(profile?.name, profile?.email || email)}</span>}</Link></div></header><div className="premium-content-grid"><section className="premium-watch-column"><p className="premium-breadcrumb"><Link href="/aluno" prefetch>Hub VIP</Link> › {module?.slug ? <Link href={`/aluno/biblioteca/${module.slug}`} prefetch>{module.title}</Link> : module?.title || 'Módulo'}</p><div className="premium-player-card"><div className="premium-player-frame"><ContentPlayer title={lesson?.title || 'Conteúdo'} mediaType={lesson?.media_type} mediaUrl={lesson?.media_url || lesson?.audio_url} driveUrl={lesson?.drive_url} lessonId={lesson?.id} initialPositionSeconds={savedPosition} trimStartSeconds={lesson?.trim_start_seconds} trimEndSeconds={lesson?.trim_end_seconds} /></div></div><section className="premium-lesson-details" id="lesson-action"><div className="premium-lesson-header-row"><div><p className="premium-module-label"><Sparkles size={16} /> {module?.title || 'Biblioteca VIP'}</p><h1>{lesson?.title || 'Aula'}</h1><p>{description}</p>{savedPosition > 5 && !completed ? <small className="muted">Retomando de aproximadamente {Math.floor(savedPosition / 60)}min {savedPosition % 60}s.</small> : null}</div>{lesson?.id ? <LessonProgressButton exerciseId={lesson.id} initialCompleted={completed} /> : null}</div><div className="premium-progress-block"><div className="premium-progress-head"><span>Progresso do módulo</span><strong>{currentPosition} de {totalLessons} aulas</strong></div><div className="premium-progress"><span style={{ width: `${progress}%` }} /></div></div><div className="premium-action-row compact"><Link className="premium-primary-button" href={`/aluno/atividade/${lesson?.slug || ''}`} prefetch><Headphones size={18} />Realizar atividade</Link><div className="premium-next-actions">{previousLesson ? <Link className="premium-round" href={`/aluno/aula/${previousLesson.slug}`} prefetch aria-label="Aula anterior"><ArrowLeft size={20} /></Link> : <span className="premium-round disabled"><ArrowLeft size={20} /></span>}{nextLesson ? <Link className="premium-round" href={`/aluno/aula/${nextLesson.slug}`} prefetch aria-label="Próxima aula"><ArrowRight size={20} /></Link> : <span className="premium-round disabled"><ArrowRight size={20} /></span>}</div></div><div className="premium-tip-card" id="lesson-notes"><Sparkles size={20} /><div><strong>Dica do professor</strong><p>Use fone para ouvir a referência e captar melhor sua voz antes de gravar sua execução.</p></div></div></section></section><aside className="premium-modules-panel"><div className="premium-modules-head"><Link href="/aluno/biblioteca" prefetch><ArrowLeft size={18} /> Módulos</Link><Link href="/aluno" prefetch><X size={18} /></Link></div><div className="premium-module-list">{modules.map((mod: any) => { const lessons = (mod.exercises || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)); const moduleOpen = hasVip || isFreeTuningModule(mod); return <section className={`premium-module-group ${moduleOpen ? '' : 'locked-vip'}`} key={mod.id}><div className="premium-module-title"><strong>{mod.title}</strong><span>{lessons.length} aulas</span>{!moduleOpen ? <em className="vip-list-badge"><Lock size={11} /> VIP</em> : null}</div><div className="premium-lessons-list">{lessons.map((item: any, index: number) => { const active = item.slug === lesson?.slug; return <Link className={`${active ? 'premium-lesson-item active no-thumb' : 'premium-lesson-item no-thumb'} ${moduleOpen ? '' : 'locked-vip-lesson'}`} href={moduleOpen ? `/aluno/aula/${item.slug}` : `/aluno/biblioteca/${mod.slug}`} prefetch key={item.id}><span className={active ? 'premium-check active' : 'premium-check'}>{active ? <Check size={14} /> : !moduleOpen ? <Lock size={13} /> : null}</span><span className="premium-thumb premium-generated-thumb"><span>{String(index + 1).padStart(2, '0')}</span><Play size={18} /></span><span className="premium-lesson-copy"><strong>{item.title}</strong><small>{moduleOpen ? `Aula ${String(index + 1).padStart(2, '0')}` : 'Exclusivo VIP'}</small></span></Link>; })}</div></section>; })}</div></aside></div></section></main>;
}
