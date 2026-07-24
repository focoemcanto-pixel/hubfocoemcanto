import Link from 'next/link';
import type { ReplayProduct } from '@/lib/live-replays';
import ReplayProducts from './replay-products';
import './replay-premium.css';

export default function ReplayView({ replay, products }: { replay: any; products: ReplayProduct[] }) {
  const expired = replay.available_until ? new Date(replay.available_until).getTime() < Date.now() : false;
  const publishedDate = replay.published_at ? new Date(replay.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  const availableUntil = replay.available_until
    ? new Date(replay.available_until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return <main className="replay-page">
    <header className="replay-topbar">
      <Link href="/" className="replay-brand"><span>F</span><div><b>FOCO EM CANTO</b><small>Replay da semana</small></div></Link>
    </header>

    <section className="replay-hero replay-hero-centered replay-consumption-first">
      <div className="replay-copy replay-copy-centered">
        <span className="replay-kicker">REPLAY DA SEMANA • {publishedDate}</span>
        <h1>Assista ao replay da última aula.</h1>
        <p>Lembre-se de anotar os pontos principais, repetir os exercícios e aplicar o conteúdo na sua rotina vocal. É a prática que transforma conhecimento em evolução.</p>
        {availableUntil ? (
          <div className="replay-availability-row replay-availability-urgent">
            <span className="replay-availability-dot" />
            <strong>Disponível até {availableUntil}</strong>
          </div>
        ) : (
          <div className="replay-availability-row">
            <span className="replay-availability-dot" />
            <strong>Replay atualizado semanalmente</strong>
          </div>
        )}
      </div>

      <div className="replay-player-shell replay-player-featured">
        {expired ? <div className="replay-expired"><b>Este replay encerrou.</b><p>Uma nova aula será publicada em breve.</p></div> : <video controls playsInline preload="metadata" poster="/images/replay-poster.jpg"><source src={`/api/drive/video/${replay.drive_file_id}`} type={replay.mime_type || 'video/webm'} />Seu navegador não conseguiu reproduzir este vídeo.</video>}
      </div>

      <div className="replay-lesson-meta">
        <span>AULA</span>
        <h2>{replay.title}</h2>
        {replay.description && <p>{replay.description}</p>}
      </div>
    </section>

    <ReplayProducts products={products} />
    <footer className="replay-footer">Foco em Canto • Técnica, percepção e prática para transformar sua voz.</footer>
  </main>;
}
