import Link from 'next/link';
import type { ReplayProduct } from '@/lib/live-replays';

function money(cents?: number | null) {
  if (!cents) return '';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ReplayView({ replay, products }: { replay: any; products: ReplayProduct[] }) {
  const expired = replay.available_until ? new Date(replay.available_until).getTime() < Date.now() : false;
  const date = replay.published_at ? new Date(replay.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  return <main className="replay-page">
    <header className="replay-topbar">
      <Link href="/" className="replay-brand"><span>F</span><div><b>FOCO EM CANTO</b><small>Replay da aula</small></div></Link>
      <a href="#produtos" className="replay-top-cta">Continuar evoluindo</a>
    </header>

    <section className="replay-hero">
      <div className="replay-copy">
        <span className="replay-kicker">AULA ESPECIAL • {date}</span>
        <h1>{replay.title}</h1>
        {replay.description && <p>{replay.description}</p>}
        {replay.available_until && <div className="replay-deadline">Disponível até {new Date(replay.available_until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>}
      </div>

      <div className="replay-player-shell">
        {expired ? <div className="replay-expired"><b>Este replay encerrou.</b><p>Continue sua jornada com os programas abaixo.</p><a href="#produtos">Ver oportunidades</a></div> : <video controls playsInline preload="metadata" poster="/images/replay-poster.jpg"><source src={`/api/drive/video/${replay.drive_file_id}`} type={replay.mime_type || 'video/webm'} />Seu navegador não conseguiu reproduzir este vídeo.</video>}
      </div>
    </section>

    <section className="replay-products" id="produtos">
      <div className="replay-section-title"><span>PRÓXIMO PASSO</span><h2>Continue sua jornada</h2><p>Escolha o programa que mais combina com o momento da sua voz.</p></div>
      <div className="replay-product-grid">
        {products.map((product) => <article key={product.id} className="replay-product-card">
          <div className="replay-product-cover">{product.cover_url ? <img src={product.cover_url} alt="" /> : <span>FOCO</span>}</div>
          <div className="replay-product-body">
            <small>{product.billing_type === 'recurring' ? 'ASSINATURA' : 'CURSO'}</small>
            <h3>{product.name}</h3>
            {product.description && <p>{product.description}</p>}
            <div className="replay-product-footer"><b>{money(product.price_cents) || 'Conheça agora'}</b><a href={product.redirect_url || '#'} target="_blank" rel="noreferrer">Quero conhecer</a></div>
          </div>
        </article>)}
      </div>
    </section>

    <footer className="replay-footer">Foco em Canto • Uma experiência de ensino criada para transformar sua voz.</footer>
  </main>;
}
