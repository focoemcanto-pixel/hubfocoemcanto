import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Lock, Sparkles } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasVipAccess } from '@/lib/access/user-permissions';

export const dynamic = 'force-dynamic';

function isRealModule(module: any) {
  const description = String(module.description || '').toLowerCase();
  return !description.startsWith('conteudos importados da pasta') && !description.startsWith('conteúdos importados da pasta');
}
function firstModuleOpen(module: any, rows: any[]) { const first = rows.find(isRealModule); return Boolean(first?.slug && module?.slug === first.slug); }

function LockedModule({ title }: { title?: string | null }) {
  return <main className="premium-module-page route-surface vip-lesson-locked-page"><section className="vip-lock-backdrop static"><section className="vip-lock-modal"><div className="vip-lock-icon"><Lock size={30} /></div><p className="eyebrow"><Sparkles size={14} /> VIP</p><h3>{title || 'Este módulo'} está bloqueado</h3><p>O primeiro módulo está aberto. Os demais fazem parte da sala VIP.</p><Link className="vip-lock-later" href="/aluno/biblioteca#sala-vip">Voltar</Link></section></section></main>;
}

export default async function StudentModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();

  const [{ data: module }, { data: allModules }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description').eq('slug', slug).single(),
    supabase.from('modules').select('id,title,slug,description,sort_order').eq('is_active', true).order('sort_order'),
  ]);

  const { data: profile } = email ? await supabase.from('profiles').select('id,email,role').eq('email', email).maybeSingle() : { data: null };
  const { data: subscriptions } = profile?.id ? await supabase.from('subscriptions').select('course_key,product_name,status').eq('profile_id', profile.id) : { data: [] };
  const hasAccess = hasVipAccess(profile, subscriptions || []) || firstModuleOpen(module, allModules || []);
  if (!hasAccess) return <LockedModule title={module?.title} />;

  const { data: lessons } = module?.id ? await supabase.from('exercises').select('id,title,slug,description,sort_order').eq('module_id', module.id).eq('is_active', true).order('sort_order') : { data: [] };
  const firstLesson = lessons?.[0];
  if (firstLesson?.slug) redirect(`/aluno/aula/${firstLesson.slug}`);

  return <main className="premium-module-page route-surface"><section className="library-hero"><p className="eyebrow">Trilha VIP</p><h1>{module?.title || 'Módulo'}</h1><p className="muted">Este módulo ainda não possui aulas publicadas.</p><Link className="button" href="/aluno/biblioteca" prefetch>Voltar para biblioteca</Link></section></main>;
}
