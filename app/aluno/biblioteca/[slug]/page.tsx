import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Lock, Sparkles } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || 'https://pay.kiwify.com.br/HHr4eyM';

function isFreeTuningModule(module: any) {
  const value = `${module?.title || ''} ${module?.slug || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return value.includes('firm') && value.includes('afin');
}

function hasVipSubscription(rows: any[]) {
  return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status));
}

function LockedModule({ title }: { title?: string | null }) {
  return (
    <main className="premium-module-page route-surface vip-lesson-locked-page">
      <section className="vip-lock-backdrop static"><section className="vip-lock-modal"><div className="vip-lock-icon"><Lock size={30} /></div><p className="eyebrow"><Sparkles size={14} /> Exclusivo VIP</p><h3>{title || 'Este módulo'} faz parte da Sala de Atividades VIP</h3><p>Assine para desbloquear todos os módulos, downloads, envio para avaliação e acompanhamento do professor.</p><ul><li>Todos os módulos</li><li>Avaliação do professor</li><li>Downloads liberados</li><li>Selo VIP na comunidade</li></ul><a className="vip-lock-cta" href={VIP_CHECKOUT_URL}>Assinar VIP agora</a><Link className="vip-lock-later" href="/aluno/biblioteca#sala-vip">Voltar para a sala</Link></section></section>
    </main>
  );
}

export default async function StudentModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();

  const { data: module } = await supabase
    .from('modules')
    .select('id,title,slug,description')
    .eq('slug', slug)
    .single();

  const { data: profile } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null };
  const { data: subscriptions } = profile?.id ? await supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id) : { data: [] };
  const hasAccess = hasVipSubscription(subscriptions || []) || isFreeTuningModule(module);

  if (!hasAccess) return <LockedModule title={module?.title} />;

  const { data: lessons } = module?.id
    ? await supabase
        .from('exercises')
        .select('id,title,slug,description,sort_order')
        .eq('module_id', module.id)
        .eq('is_active', true)
        .order('sort_order')
    : { data: [] };

  const firstLesson = lessons?.[0];

  if (firstLesson?.slug) {
    redirect(`/aluno/aula/${firstLesson.slug}`);
  }

  return (
    <main className="premium-module-page route-surface">
      <section className="library-hero">
        <p className="eyebrow">Trilha VIP</p>
        <h1>{module?.title || 'Módulo'}</h1>
        <p className="muted">Este módulo ainda não possui aulas publicadas.</p>
        <Link className="button" href="/aluno/biblioteca" prefetch>Voltar para biblioteca</Link>
      </section>
    </main>
  );
}
