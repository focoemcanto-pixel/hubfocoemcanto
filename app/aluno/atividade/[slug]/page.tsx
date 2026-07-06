import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { DuetRecorder } from '@/components/duet-recorder-caption-clean';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasVipAccess } from '@/lib/access/user-permissions';
import { cloudflareStreamEmbed, cloudflareStreamSource } from '@/lib/media/stream';

export const dynamic = 'force-dynamic';

const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || 'https://pay.kiwify.com.br/HHr4eyM';

const DuetRecorderWithAccess = DuetRecorder as unknown as (props: {
  lessonTitle: string;
  lessonSlug: string;
  referenceUrl?: string | null;
  referenceEmbedUrl?: string | null;
  canSendForReview?: boolean;
}) => ReactElement;

function driveFileId(url?: string | null) {
  if (!url) return null;
  return (url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/))?.[1] || null;
}

function drivePreview(url?: string | null) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : url || '';
}

function isFreeTuningModule(module: any) {
  const value = `${module?.title || ''} ${module?.slug || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return value.includes('firm') && value.includes('afin');
}

function LockedActivity() {
  return (
    <main className="activity-page vip-lesson-locked-page">
      <section className="vip-lock-backdrop static">
        <section className="vip-lock-modal">
          <div className="vip-lock-icon"><Lock size={30} /></div>
          <p className="eyebrow"><Sparkles size={14} /> Exclusivo VIP</p>
          <h3>Este dueto faz parte da Sala de Atividades VIP</h3>
          <p>Para gravar este módulo, desbloqueie o VIP.</p>
          <a className="vip-lock-cta" href={VIP_CHECKOUT_URL}>Assinar VIP agora</a>
          <Link className="vip-lock-later" href="/aluno/biblioteca#sala-vip">Voltar para a sala</Link>
        </section>
      </section>
    </main>
  );
}

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const email = (await cookies()).get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const { data: lesson } = await supabase
    .from('exercises')
    .select('id,title,slug,description,drive_url,media_url,audio_url,stream_uid,modules(title,slug)')
    .eq('slug', slug)
    .single();

  const module = Array.isArray(lesson?.modules) ? lesson?.modules[0] : lesson?.modules;
  const { data: profile } = email ? await supabase.from('profiles').select('id,email,role').eq('email', email).maybeSingle() : { data: null };
  const { data: subscriptions } = profile?.id ? await supabase.from('subscriptions').select('course_key,product_name,status').eq('profile_id', profile.id) : { data: [] };
  const hasVip = hasVipAccess(profile, subscriptions || []);
  if (!hasVip && !isFreeTuningModule(module)) return <LockedActivity />;

  const streamUrl = cloudflareStreamSource(lesson?.stream_uid);
  const referenceUrl = streamUrl || lesson?.media_url || lesson?.drive_url || lesson?.audio_url || '';
  const referenceEmbedUrl = streamUrl ? cloudflareStreamEmbed(lesson?.stream_uid) : drivePreview(referenceUrl);

  return (
    <main className="activity-page duet-activity-page">
      <DuetRecorderWithAccess
        lessonTitle={lesson?.title || 'Atividade'}
        lessonSlug={lesson?.slug || slug}
        referenceUrl={referenceUrl}
        referenceEmbedUrl={referenceEmbedUrl}
        canSendForReview={hasVip}
      />
    </main>
  );
}
