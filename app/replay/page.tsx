import ReplayView from './replay-view';
import { getReplayBySlug, getReplayProducts } from '@/lib/live-replays';
import './replay.css';

export const dynamic = 'force-dynamic';

export default async function CurrentReplayPage() {
  const [replay, products] = await Promise.all([getReplayBySlug(), getReplayProducts()]);

  if (!replay) {
    return (
      <main className="replay-page">
        <header className="replay-topbar">
          <a href="/" className="replay-brand"><span>F</span><div><b>FOCO EM CANTO</b><small>Replay da aula</small></div></a>
        </header>
        <section className="replay-hero" style={{ minHeight: '72vh', alignItems: 'center' }}>
          <div className="replay-copy">
            <span className="replay-kicker">FOCO LIVE</span>
            <h1>O próximo replay será publicado aqui.</h1>
            <p>Assim que a gravação da aula for enviada e publicada, este mesmo link exibirá automaticamente o vídeo mais recente.</p>
            <div className="replay-deadline">Link permanente: escola.focoemcanto.com/replay</div>
          </div>
          <div className="replay-player-shell" style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
            <div className="replay-expired">
              <b>Nenhum replay publicado ainda</b>
              <p>Finalize uma gravação pelo Foco Live e clique em “Salvar e publicar replay”.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return <ReplayView replay={replay} products={products} />;
}
