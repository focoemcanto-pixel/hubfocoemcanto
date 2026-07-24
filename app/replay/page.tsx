import ReplayView from './replay-view';
import ReplayProducts from './replay-products';
import { getReplayBySlug, getReplayProducts } from '@/lib/live-replays';
import './replay.css';

export const dynamic = 'force-dynamic';

export default async function CurrentReplayPage() {
  const [replay, products] = await Promise.all([getReplayBySlug(), getReplayProducts()]);

  if (!replay) {
    return (
      <main className="replay-page replay-empty-page">
        <header className="replay-topbar">
          <a href="/" className="replay-brand"><span>F</span><div><b>FOCO EM CANTO</b><small>Experiência de replay</small></div></a>
          <a href="#cursos" className="replay-top-cta">Ver cursos</a>
        </header>

        <section className="replay-hero replay-hero-centered replay-empty-centered">
          <div className="replay-copy replay-copy-centered">
            <span className="replay-kicker">FOCO LIVE • CONTEÚDO EXCLUSIVO</span>
            <h1>Sua próxima aula especial vai aparecer aqui.</h1>
            <p>Este é o endereço oficial dos replays do Foco em Canto. Assim que uma nova aula for publicada, o vídeo ocupará o centro desta experiência.</p>
          </div>

          <div className="replay-player-shell replay-player-featured replay-empty-player">
            <div className="replay-preview-stage"><div className="replay-preview-badge">PRÓXIMO REPLAY</div><div className="replay-preview-play">▶</div></div>
          </div>
          <div className="replay-empty-actions"><span className="replay-deadline">Link oficial: escola.focoemcanto.com/replay</span></div>
        </section>

        <ReplayProducts products={products} />
        <footer className="replay-footer">Foco em Canto • Técnica, percepção e prática para transformar sua voz.</footer>
      </main>
    );
  }

  return <ReplayView replay={replay} products={products} />;
}
