import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type EventRow = {
  event_type: 'display' | 'click' | 'hide';
  display_mode: string | null;
  participant_count: number | null;
  created_at: string;
  offer: { id: string; name: string } | null;
};

export default async function LiveOfferAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: live }, { data: events, error }] = await Promise.all([
    supabase.from('live_sessions').select('id,title,slug').eq('id', id).maybeSingle(),
    supabase
      .from('live_offer_events')
      .select('event_type,display_mode,participant_count,created_at,offer:live_offers(id,name)')
      .eq('live_session_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (!live) notFound();
  const rows = (events || []) as unknown as EventRow[];
  const displays = rows.filter((item) => item.event_type === 'display');
  const clicks = rows.filter((item) => item.event_type === 'click');
  const viewers = displays.reduce((sum, item) => sum + (item.participant_count || 0), 0);
  const ctr = viewers > 0 ? ((clicks.length / viewers) * 100).toFixed(1) : '0.0';

  const byOffer = new Map<string, { name: string; displays: number; clicks: number; viewers: number }>();
  rows.forEach((item) => {
    const key = item.offer?.id || 'sem-oferta';
    const current = byOffer.get(key) || { name: item.offer?.name || 'Oferta removida', displays: 0, clicks: 0, viewers: 0 };
    if (item.event_type === 'display') {
      current.displays += 1;
      current.viewers += item.participant_count || 0;
    }
    if (item.event_type === 'click') current.clicks += 1;
    byOffer.set(key, current);
  });

  return (
    <main className="foco-live-admin">
      <section className="foco-live-hero">
        <div>
          <span className="foco-live-kicker">Analytics de ofertas</span>
          <h1>{live.title}</h1>
          <p>Acompanhe exibições, pessoas alcançadas, cliques e taxa de interesse em cada oferta.</p>
        </div>
        <a className="foco-live-secondary" href={`/admin/foco-live/${live.id}`}>← Voltar para a live</a>
      </section>

      {error?.code === '42P01' ? (
        <section className="foco-live-panel"><div className="foco-live-empty"><strong>Analytics ainda não ativado.</strong><p>Execute a migration 20260714_create_live_offer_events.sql no Supabase.</p></div></section>
      ) : <>
        <section className="foco-live-stats">
          <article><span>Exibições</span><strong>{displays.length}</strong><small>Vezes em que uma oferta foi ativada</small></article>
          <article><span>Pessoas alcançadas</span><strong>{viewers}</strong><small>Soma do público presente nas exibições</small></article>
          <article><span>Cliques</span><strong>{clicks.length}</strong><small>Acessos enviados ao checkout</small></article>
          <article><span>CTR estimado</span><strong>{ctr}%</strong><small>Cliques sobre pessoas alcançadas</small></article>
        </section>

        <section className="foco-live-panel foco-live-list-panel">
          <div className="foco-live-panel-head"><div><span className="foco-live-kicker">Desempenho</span><h2>Resultados por oferta</h2></div></div>
          <div className="foco-live-list">
            {[...byOffer.entries()].length === 0 ? <div className="foco-live-empty"><strong>Nenhuma oferta exibida ainda.</strong><p>Os resultados aparecerão aqui durante a live.</p></div> : [...byOffer.entries()].map(([key, item]) => {
              const offerCtr = item.viewers > 0 ? ((item.clicks / item.viewers) * 100).toFixed(1) : '0.0';
              return <div key={key} className="foco-live-analytics-row"><div><strong>{item.name}</strong><small>{item.displays} exibições · {item.viewers} pessoas alcançadas</small></div><em>{item.clicks} cliques</em><b>{offerCtr}% CTR</b></div>;
            })}
          </div>
        </section>
      </>}
    </main>
  );
}
