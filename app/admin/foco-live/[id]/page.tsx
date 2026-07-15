import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import OfferSelector from './offer-selector';
import ShareLiveButton from './share-live-button';

export const dynamic = 'force-dynamic';

type LiveRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  access_type: string;
  guest_access_enabled: boolean;
  starts_at: string | null;
  daily_room_url: string | null;
  recording_enabled: boolean;
  current_scene: string;
};

type OfferRow = { id: string; name: string; headline: string | null; price: string | null };

function dateLabel(value: string | null) {
  if (!value) return 'Data ainda não definida';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });
}

function accessLabel(value: string) {
  if (value === 'public') return 'Pública';
  if (value === 'hybrid') return 'Híbrida';
  return 'Restrita';
}

export default async function FocoLiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data }, { data: offers }, { data: links }] = await Promise.all([
    supabase.from('live_sessions').select('id,title,slug,description,status,access_type,guest_access_enabled,starts_at,daily_room_url,recording_enabled,current_scene').eq('id', id).maybeSingle(),
    supabase.from('live_offers').select('id,name,headline,price').eq('is_active', true).order('created_at', { ascending: false }),
    supabase.from('live_session_offers').select('offer_id').eq('live_session_id', id).order('sort_order'),
  ]);

  if (!data) notFound();
  const live = data as LiveRow;

  return (
    <main className="foco-live-admin">
      <section className="foco-live-hero">
        <div>
          <span className="foco-live-kicker">Gerenciar transmissão</span>
          <h1>{live.title}</h1>
          <p>{live.description || 'Configure, teste e compartilhe sua transmissão pelo Foco Live.'}</p>
        </div>
        <div className="foco-live-actions">
          <a className="foco-live-secondary" href={`/admin/foco-live/${live.id}/analytics`}>Ver analytics</a>
          <a className="foco-live-secondary" href="/admin/foco-live">← Voltar para as lives</a>
        </div>
      </section>

      <section className="foco-live-stats">
        <article><span>Status</span><strong>{live.status}</strong><small>Cena atual: {live.current_scene || 'waiting'}</small></article>
        <article><span>Data e horário</span><strong style={{ fontSize: 18 }}>{dateLabel(live.starts_at)}</strong><small>Horário da transmissão</small></article>
        <article><span>Acesso</span><strong>{accessLabel(live.access_type)}</strong><small>{live.guest_access_enabled ? 'Convidados liberados' : 'Somente usuários autorizados'}</small></article>
        <article><span>Gravação</span><strong>{live.recording_enabled ? 'Ativa' : 'Desativada'}</strong><small>Configuração da Daily</small></article>
      </section>

      <section className="foco-live-grid">
        <article className="foco-live-panel foco-live-featured">
          <div className="foco-live-panel-head">
            <div><span className="foco-live-kicker">Sala da transmissão</span><h2>Pronta para testar</h2></div>
            <span className={`foco-live-status ${live.status === 'live' ? 'is-live' : ''}`}>{live.status === 'live' ? 'AO VIVO' : live.status.toUpperCase()}</span>
          </div>
          <div className="foco-live-stage-preview">
            <div className="foco-live-stage-glow" />
            <div className="foco-live-host-card"><span>MC</span><div><strong>Marcos Cruz</strong><small>Host principal</small></div></div>
            <div className="foco-live-scene-card"><small>LINK PÚBLICO</small><strong>/live/{live.slug}</strong><p>Envie este link para os convidados entrarem.</p></div>
          </div>
          <div className="foco-live-actions">
            <a className="foco-live-primary" href={`/live/${live.slug}?host=1`}>Entrar no estúdio</a>
            <a className="foco-live-secondary" href={`/live/${live.slug}`} target="_blank" rel="noreferrer">Abrir sala pública</a>
            <ShareLiveButton title={live.title} description={live.description} slug={live.slug} startsAt={live.starts_at} />
          </div>
        </article>

        <article className="foco-live-panel foco-live-control">
          <div className="foco-live-panel-head"><div><span className="foco-live-kicker">Compartilhamento</span><h2>Link da live</h2></div></div>
          <div className="foco-live-scene-list">
            <button type="button"><b>01</b><span><strong>Link para convidados</strong><small>/live/{live.slug}</small></span></button>
            <button type="button"><b>02</b><span><strong>Entrada como host</strong><small>/live/{live.slug}?host=1</small></span></button>
            <button type="button"><b>03</b><span><strong>Tipo de acesso</strong><small>{accessLabel(live.access_type)}</small></span></button>
            <a href={`/admin/foco-live/${live.id}/analytics`}><b>04</b><span><strong>Analytics de ofertas</strong><small>Exibições, alcance, cliques e CTR</small></span></a>
          </div>
        </article>
      </section>

      <OfferSelector
        liveId={live.id}
        offers={(offers || []) as OfferRow[]}
        initialSelected={(links || []).map((item: any) => item.offer_id)}
      />
    </main>
  );
}
