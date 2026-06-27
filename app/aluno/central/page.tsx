import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { DailyTrainingLiveStats } from '@/components/daily-training-live-stats';
import { dailyTrainingSteps } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

const css = `.training-center{max-width:880px}.training-hero{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:32px;padding:42px 44px;background:radial-gradient(circle at 78% 18%,rgba(245,199,107,.22),transparent 32%),linear-gradient(145deg,#06070a,#111820 54%,#050506);box-shadow:0 34px 110px rgba(0,0,0,.48)}.training-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(46px,6.8vw,76px);line-height:.9;margin:14px 0 12px;letter-spacing:-.06em}.training-hero p:not(.eyebrow){max-width:560px;color:#bfc0ca;line-height:1.5}.mode-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:26px}.mode-card{position:relative;overflow:hidden;border-radius:24px;padding:20px;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.14);background:linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.025));min-height:156px;display:grid;align-content:space-between}.mode-card.daily{border-color:rgba(245,199,107,.55);box-shadow:0 0 48px rgba(245,199,107,.09)}.mode-card.custom{border-color:rgba(38,224,196,.45)}.mode-card.repertoire{border-color:rgba(142,92,255,.48);box-shadow:0 0 46px rgba(142,92,255,.08)}.mode-card strong{display:block;text-transform:uppercase;font-size:20px;letter-spacing:.02em}.mode-card p{color:#c9cbd3;margin:8px 0 0;line-height:1.36}.mode-icon{font-size:34px;color:#f5c76b}.mode-card.custom .mode-icon{color:#26e0c4}.mode-card.repertoire .mode-icon{color:#b899ff}.mode-arrow{position:absolute;right:20px;top:50%;transform:translateY(-50%);font-size:34px;color:#fff}.today-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.today-progress div{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.045);padding:14px}.today-progress strong{display:block;color:#f5c76b;font-size:25px}.today-progress span{color:#bfc0ca;text-transform:uppercase;font-size:10px;font-weight:900;letter-spacing:.08em}.daily-preview{margin-top:22px;border:1px solid rgba(245,199,107,.18);border-radius:28px;background:linear-gradient(135deg,rgba(245,199,107,.1),rgba(255,255,255,.025));padding:18px}.daily-preview-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.daily-preview-head h2{margin:0;font-size:28px}.daily-preview-head a{color:#f5c76b;font-weight:950;text-decoration:none}.daily-track{display:flex;align-items:center;gap:8px;margin:8px 0 16px}.daily-track-piece{display:contents}.daily-dot{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,255,255,.18);font-weight:950;color:#8d9098}.daily-dot.done{border-color:#26e0c4;color:#26e0c4}.daily-dot.current{border-color:#f5c76b;color:#f5c76b;box-shadow:0 0 24px rgba(245,199,107,.18)}.daily-line{height:2px;flex:1;background:rgba(255,255,255,.18)}.daily-current-card{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:rgba(0,0,0,.18);padding:16px;text-decoration:none;color:#fff}.daily-current-card small{display:block;color:#f5c76b;font-weight:950}.daily-current-card h3{margin:4px 0 4px}.daily-current-card p{margin:0;color:#c8cad2}@media(max-width:640px){.training-hero{padding:30px 22px}.training-hero h1{font-size:48px}.mode-grid{grid-template-columns:1fr}.today-progress{grid-template-columns:repeat(2,1fr)}.today-progress div{padding:12px 10px}}`;

export default function TrainingCenterPage() {
  const currentStep = dailyTrainingSteps[0];
  return (
    <AppShell>
      <main className="page training-center">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <section className="training-hero">
          <p className="eyebrow">Central de Treinamento ★</p>
          <h1>Treine sua voz todos os dias.</h1>
          <p>Escolha um desafio diário sequencial ou monte seu treino por objetivo no modo personalizado.</p>
          <div className="mode-grid">
            <Link className="mode-card daily" href="/aluno/central/diarios" prefetch><div><div className="mode-icon">▣</div><strong>Diários</strong><p>Desafios sequenciais para criar hábito e evolução constante.</p></div><span className="mode-arrow">›</span></Link>
            <Link className="mode-card custom" href="/aluno/central/personalizado" prefetch><div><div className="mode-icon">≋</div><strong>Personalizado</strong><p>Escolha o objetivo, o exercício e personalize seu treino.</p></div><span className="mode-arrow">›</span></Link>
            <Link className="mode-card repertoire" href="/aluno/central/repertorio" prefetch><div><div className="mode-icon">♫</div><strong>Estude seu Repertório</strong><p>Use um vídeo do YouTube, defina seu tom e gere um resumo para a banda.</p></div><span className="mode-arrow">›</span></Link>
          </div>
          <DailyTrainingLiveStats />
        </section>
        <section className="daily-preview">
          <div className="daily-preview-head"><div><p className="eyebrow">Desafio diário</p><h2>Dia {currentStep.day}</h2></div><Link href="/aluno/central/diarios/progresso" prefetch>Ver progresso →</Link></div>
          <DailyTrainingLiveStats variant="track" />
        </section>
      </main>
    </AppShell>
  );
}
