import { cookies } from 'next/headers';
import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';
import { DuetRecorder } from '@/components/duet-recorder';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || 'https://pay.kiwify.com.br/HHr4eyM';
const DuetRecorderWithAccess = DuetRecorder as unknown as (props: {
  lessonTitle: string;
  lessonSlug: string;
  referenceUrl?: string | null;
  referenceEmbedUrl?: string | null;
  canSendForReview?: boolean;
}) => JSX.Element;

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function drivePreview(url?: string | null) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : url || '';
}

function isFreeTuningModule(module: any) {
  const value = `${module?.title || ''} ${module?.slug || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return value.includes('firmando') && value.includes('afinacao');
}

function hasVipSubscription(rows: any[]) {
  return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status));
}

function LockedActivity() {
  return <main className="activity-page vip-lesson-locked-page"><section className="vip-lock-backdrop static"><section className="vip-lock-modal"><div className="vip-lock-icon"><Lock size={30} /></div><p className="eyebrow"><Sparkles size={14} /> Exclusivo VIP</p><h3>Este dueto faz parte da Sala de Atividades VIP</h3><p>O módulo Firmando a Afinação está liberado grátis. Para gravar os demais módulos, desbloqueie o VIP.</p><ul><li>Todos os módulos</li><li>Avaliação do professor</li><li>Downloads liberados</li><li>Selo VIP</li></ul><a className="vip-lock-cta" href={VIP_CHECKOUT_URL}>Assinar VIP agora</a><Link className="vip-lock-later" href="/aluno/biblioteca#sala-vip">Voltar para a sala</Link></section></section></main>;
}

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const { data: lesson } = await supabase
    .from('exercises')
    .select('id,title,slug,description,drive_url,media_url,audio_url,modules(title,slug)')
    .eq('slug', slug)
    .single();

  const module = Array.isArray(lesson?.modules) ? lesson?.modules[0] : lesson?.modules;
  const { data: profile } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null };
  const { data: subscriptions } = profile?.id ? await supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id) : { data: [] };
  const hasVip = hasVipSubscription(subscriptions || []);
  const isFree = isFreeTuningModule(module);
  if (!hasVip && !isFree) return <LockedActivity />;

  const referenceUrl = lesson?.media_url || lesson?.drive_url || lesson?.audio_url || '';

  return (
    <main className="activity-page">
      <header className="activity-topbar">
        <a href={`/aluno/aula/${lesson?.slug || slug}`}>← Voltar para aula</a>
        <strong>{module?.title || 'Atividade VIP'}</strong>
      </header>
      <DuetRecorderWithAccess
        lessonTitle={lesson?.title || 'Atividade'}
        lessonSlug={lesson?.slug || slug}
        referenceUrl={referenceUrl}
        referenceEmbedUrl={drivePreview(referenceUrl)}
        canSendForReview={hasVip}
      />
    </main>
  );
}
