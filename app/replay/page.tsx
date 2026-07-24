import ReplayView from './replay-view';
import { getReplayBySlug, getReplayProducts } from '@/lib/live-replays';
import './replay.css';

export const dynamic = 'force-dynamic';

function money(cents?: number | null) {
  if (!cents) return '';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function CurrentReplayPage() {
  const [replay, products] = await Promise.all([getReplayBySlug(), getReplayProducts()]);

  if (!replay) {
    return (
      <main className="replay-page replay-empty-page">
        <header className="replay-topbar">
          <a href="/" className="replay-brand"><span>F</span><div><b>FOCO EM CANTO</b><small>Experiência de replay</small></div></a>
          <a href="#formacoes" className="replay-top-cta">Conhecer formações</a>
        </header>

        <section className="replay-empty-hero">
          <div className="replay-empty-copy">
            <span className="replay-kicker">FOCO LIVE • CONTEÚDO EXCLUSIVO</span>
            <h1>Sua próxima aula especial vai aparecer aqui.</h1>
            <p>Este é o endereço oficial dos replays do Foco em Canto. Assim que uma nova aula for publicada, o vídeo entra automaticamente nesta página.</p>
            <div className="replay-empty-actions">
              <a href="#formacoes" className="replay-primary-action">Explorar formações</a>
              <span className="replay-deadline">Link oficial: escola.focoemcanto.com/replay</span>
            </div>
          </div>

          <div className="replay-preview-card">
            <div className="replay-preview-glow" />
            <div className="replay-preview-badge">PRÓXIMO REPLAY</div>
            <div className="replay-preview-stage">
              <div className="replay-preview-play">▶</div>
            </div>
            <div className="replay-preview-meta">
              <div>
                <small>EM BREVE</small>
                <b>Uma nova experiência de aprendizado ao vivo</b>
              </div>
              <span>16:9</span>
            </div>
          </div>
        </section>

        <section className="replay-benefits">
          <article><span>01</span><div><b>Aulas práticas</b><p>Conteúdo aplicado para você desenvolver sua voz com clareza e direção.</p></div></article>
          <article><span>02</span><div><b>Replay organizado</b><p>Um único link para acessar sempre a aula mais recente publicada pela escola.</p></div></article>
          <article><span>03</span><div><b>Próximo passo</b><p>Após a aula, você encontra as formações ideais para continuar evoluindo.</p></div></article>
        </section>

        <section className="replay-products" id="formacoes">
          <div className="replay-section-title">
            <span>ESCOLA FOCO EM CANTO</span>
            <h2>Continue evoluindo com nossas formações</h2>
            <p>Escolha o programa que mais combina com o momento atual da sua voz.</p>
          </div>

          {products.length > 0 ? (
            <div className="replay-product-grid">
              {products.map((product) => (
                <article key={product.id} className="replay-product-card">
                  <div className="replay-product-cover">
                    {product.cover_url ? <img src={product.cover_url} alt={product.name} /> : <span>FOCO</span>}
                  </div>
                  <div className="replay-product-body">
                    <small>{product.billing_type === 'recurring' ? 'ASSINATURA' : 'FORMAÇÃO'}</small>
                    <h3>{product.name}</h3>
                    {product.description && <p>{product.description}</p>}
                    <div className="replay-product-footer">
                      <b>{money(product.price_cents) || 'Conheça agora'}</b>
                      <a href={product.redirect_url || '#'} target="_blank" rel="noreferrer">Ver detalhes</a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="replay-products-empty">
              <span>FOCO EM CANTO</span>
              <h3>Novas formações serão apresentadas aqui.</h3>
              <p>Os cursos publicados no painel da escola aparecerão automaticamente nesta vitrine.</p>
            </div>
          )}
        </section>

        <footer className="replay-footer">Foco em Canto • Técnica, percepção e prática para transformar sua voz.</footer>
      </main>
    );
  }

  return <ReplayView replay={replay} products={products} />;
}
