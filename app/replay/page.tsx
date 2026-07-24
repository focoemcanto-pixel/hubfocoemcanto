import ReplayView from './replay-view';
import ReplayProducts from './replay-products';
import { getReplayBySlug, getReplayProducts } from '@/lib/live-replays';
import './replay.css';
import './replay-premium.css';

export const dynamic = 'force-dynamic';

export default async function CurrentReplayPage() {
  const [replay, products] = await Promise.all([getReplayBySlug(), getReplayProducts()]);

  if (!replay) {
    return (
      <main className="replay-page replay-empty-page">
        <header className="replay-topbar">
          <a href="/" className="replay-brand"><span>F</span><div><b>FOCO EM CANTO</b><small>Replay da semana</small></div></a>
        </header>

        <section className="replay-hero replay-hero-centered replay-empty-centered">
          <div className="replay-copy replay-copy-centered">
            <span className="replay-kicker">REPLAY DA SEMANA • ATUALIZADO SEMANALMENTE</span>
            <h1>O replay da última aula será publicado aqui.</h1>
            <p>Quando a gravação estiver disponível, assista com atenção, anote os pontos principais e aplique cada exercício na sua rotina vocal.</p>
            <div className="replay-availability-row">
              <span className="replay-availability-dot" />
              <strong>O período de disponibilidade será informado nesta página.</strong>
            </div>
          </div>

          <div className="replay-player-shell replay-player-featured replay-empty-player">
            <div className="replay-preview-stage"><div className="replay-preview-badge">PRÓXIMO REPLAY</div><div className="replay-preview-play">▶</div></div>
          </div>
        </section>

        <ReplayProducts products={products} />
        <footer className="replay-footer">Foco em Canto • Técnica, percepção e prática para transformar sua voz.</footer>
      </main>
    );
  }

  return <ReplayView replay={replay} products={products} />;
}
