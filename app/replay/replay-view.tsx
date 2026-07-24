import Link from 'next/link';
import type { ReplayProduct } from '@/lib/live-replays';
import ReplayProducts from './replay-products';

export default function ReplayView({ replay, products }: { replay: any; products: ReplayProduct[] }) {
  const expired = replay.available_until ? new Date(replay.available_until).getTime() < Date.now() : false;
  const date = replay.published_at ? new Date(replay.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  return <main className="replay-page">
    <header className="replay-topbar">
      <Link href="/" className="replay-brand"><span>F</span><div><b>FOCO EM CANTO</b><small>Replay da aula</small></div></Link>
      <a href="#cursos" className="replay-top-cta">Ver cursos</a>
    </header>

    <section className="replay-hero replay-hero-centered">
      <div className="replay-copy replay-copy-centered">
        <span className="replay-kicker">AULA ESPECIAL • {date}</span>
        <h1>{replay.title}</h1>
        {replay.description && <p>{replay.description}</p>}
        {replay.available_until && <div className="replay-deadline">Disponível até {new Date(replay.available_until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>}
      </div>

      <div className="replay-player-shell replay-player-featured">
        {expired ? <div className="replay-expired"><b>Este replay encerrou.</b><p>Continue sua jornada com os cursos abaixo.</p><a href="#cursos">Ver cursos</a></div> : <video controls playsInline preload="metadata" poster="/images/replay-poster.jpg"><source src={`/api/drive/video/${replay.drive_file_id}`} type={replay.mime_type || 'video/webm'} />Seu navegador não conseguiu reproduzir este vídeo.</video>}
      </div>
      <p className="replay-watch-note">Assista com atenção, faça suas anotações e depois escolha abaixo o próximo passo mais adequado para a sua voz.</p>
    </section>

    <ReplayProducts products={products} />
    <footer className="replay-footer">Foco em Canto • Técnica, percepção e prática para transformar sua voz.</footer>
  </main>;
}
