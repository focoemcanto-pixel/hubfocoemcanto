import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type LiveRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  access_type: string;
  starts_at: string | null;
  daily_room_url: string | null;
  guest_access_enabled: boolean;
};

function dateLabel(value: string | null) {
  if (!value) return 'Data ainda não definida';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default async function FocoLiveAdminPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('live_sessions')
    .select('id,title,slug,status,access_type,starts_at,daily_room_url,guest_access_enabled')
    .order('starts_at', { ascending: true })
    .limit(12);

  const lives = (data || []) as LiveRow[];
  const liveNow = lives.find((item) => item.status === 'live');
  const upcoming = lives.filter((item) => item.status === 'scheduled');

  return (
    <main className="foco-live-admin">
      <section className="foco-live-hero">
        <div>
          <span className="foco-live-kicker">Foco Live Studio</span>
          <h1>Sua central de transmissões, aulas e conversão.</h1>
          <p>Crie salas próprias, receba alunos ou convidados e controle ofertas, QR Codes, avisos e cenas em tempo real.</p>
        </div>
        <div className="foco-live-actions">
          <a className="foco-live-secondary" href="/admin/foco-live/ofertas">Biblioteca de ofertas</a>
          <a className="foco-live-primary" href="/admin/foco-live/nova">+ Criar nova live</a>
        </div>
      </section>

      <section className="foco-live-stats">
        <article><span>Ao vivo agora</span><strong>{liveNow ? '1' : '0'}</strong><small>{liveNow?.title || 'Nenhuma transmissão ativa'}</small></article>
        <article><span>Próximas lives</span><strong>{upcoming.length}</strong><small>Salas programadas</small></article>
        <article><span>Entrada de convidados</span><strong>Ativa</strong><small>Sem cadastro obrigatório</small></article>
        <article><span>Motor de vídeo</span><strong>Daily</strong><small>Integração via API privada</small></article>
      </section>

      <section className="foco-live-grid">
        <article className="foco-live-panel foco-live-featured">
          <div className="foco-live-panel-head"><div><span className="foco-live-kicker">Próxima transmissão</span><h2>{liveNow?.title || upcoming[0]?.title || 'Prepare sua primeira live'}</h2></div><span className={`foco-live-status ${liveNow ? 'is-live' : ''}`}>{liveNow ? 'AO VIVO' : 'PRONTA PARA CONFIGURAR'}</span></div>
          <div className="foco-live-stage-preview">
            <div className="foco-live-stage-glow" />
            <div className="foco-live-host-card"><span>MC</span><div><strong>Marcos Cruz</strong><small>Host principal</small></div></div>
            <div className="foco-live-scene-card"><small>CENA ATUAL</small><strong>Modo aula</strong><p>Vídeo em destaque + chat lateral</p></div>
          </div>
          <div className="foco-live-actions">
            <a className="foco-live-primary" href={liveNow ? `/live/${liveNow.slug}?host=1` : '/admin/foco-live/nova'}>{liveNow ? 'Entrar no estúdio' : 'Configurar primeira live'}</a>
            {liveNow?.slug && <a className="foco-live-secondary" href={`/live/${liveNow.slug}`}>Abrir sala pública</a>}
          </div>
        </article>

        <article className="foco-live-panel foco-live-control">
          <div className="foco-live-panel-head"><div><span className="foco-live-kicker">Direção ao vivo</span><h2>Cenas rápidas</h2></div></div>
          <div className="foco-live-scene-list">
            <button><b>01</b><span><strong>Modo aula</strong><small>Vídeo + chat</small></span></button>
            <button><b>02</b><span><strong>Compartilhar tela</strong><small>Apresentação em destaque</small></span></button>
            <a href="/admin/foco-live/ofertas"><b>03</b><span><strong>Biblioteca de ofertas</strong><small>Produtos, links e CTAs reutilizáveis</small></span></a>
            <button><b>04</b><span><strong>Mostrar aviso</strong><small>Mensagem instantânea</small></span></button>
          </div>
        </article>
      </section>

      <section className="foco-live-panel foco-live-list-panel">
        <div className="foco-live-panel-head"><div><span className="foco-live-kicker">Agenda</span><h2>Suas transmissões</h2></div></div>
        <div className="foco-live-list">
          {lives.length === 0 ? (
            <div className="foco-live-empty"><strong>Nenhuma live cadastrada ainda.</strong><p>Crie a primeira sala e gere seu link personalizado.</p></div>
          ) : lives.map((live) => (
            <a href={`/admin/foco-live/${live.id}`} key={live.id}>
              <span className={`foco-live-dot status-${live.status}`} />
              <div><strong>{live.title}</strong><small>{dateLabel(live.starts_at)} · {live.access_type === 'public' ? 'Pública' : live.access_type === 'hybrid' ? 'Híbrida' : 'Restrita'}</small></div>
              <em>{live.guest_access_enabled ? 'Convidados liberados' : 'Somente alunos'}</em>
              <b>Gerenciar →</b>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
