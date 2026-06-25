import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { dailyTrainingSteps, getDailyTrainingStep } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

const css = `.done-page{min-height:calc(100dvh - 86px);display:grid;place-items:center;margin:-12px -10px 0;padding:24px 18px;background:radial-gradient(circle at 50% 28%,rgba(245,199,107,.24),transparent 28%),linear-gradient(180deg,#111317,#050506);color:#fff}.done-card{width:min(100%,420px);text-align:center}.done-check{width:118px;height:118px;border-radius:50%;display:grid;place-items:center;margin:0 auto 24px;border:2px solid #f5c76b;color:#f5c76b;font-size:62px;box-shadow:0 0 60px rgba(245,199,107,.28)}.done-card h1{font-family:Georgia,'Times New Roman',serif;font-size:48px;line-height:.95;margin:0 0 10px}.done-card p{color:#d4d4dc;line-height:1.5}.done-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:28px 0}.done-stat{border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px;background:rgba(255,255,255,.05)}.done-stat strong{display:block;color:#f5c76b;font-size:23px}.done-stat span{font-size:11px;color:#bfc0ca;font-weight:900}.done-next{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid rgba(245,199,107,.25);border-radius:22px;background:linear-gradient(90deg,rgba(245,199,107,.12),rgba(38,224,196,.07));padding:16px;margin:20px 0;text-decoration:none;color:#fff;text-align:left}.done-next small{display:block;color:#f5c76b;font-weight:900}.done-button{display:block;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#14100a;text-transform:uppercase;font-weight:950;text-decoration:none;padding:17px 20px;margin-top:18px}.done-link{display:inline-block;margin-top:18px;color:#f5c76b;font-weight:900}`;

export default async function DailyDonePage({ searchParams }: { searchParams: Promise<{ exercicio?: string }> }) {
  const params = await searchParams;
  const current = Number(params.exercicio || 1);
  const step = getDailyTrainingStep(current) || dailyTrainingSteps[0];
  const next = getDailyTrainingStep(current + 1);

  return (
    <AppShell>
      <main className="page" style={{ padding: 0 }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <section className="done-page">
          <div className="done-card">
            <div className="done-check">✓</div>
            <h1>Excelente!</h1>
            <p>Você concluiu o Exercício #{step.exerciseNumber} do desafio diário.</p>
            <div className="done-stats">
              <div className="done-stat"><strong>+{step.points}</strong><span>Pontos</span></div>
              <div className="done-stat"><strong>{step.day}</strong><span>Dia</span></div>
              <div className="done-stat"><strong>{step.exerciseNumber}/{dailyTrainingSteps.length}</strong><span>Treinos</span></div>
            </div>
            {next ? <Link className="done-next" href={`/aluno/central/diarios/${next.exerciseNumber}`} prefetch><div><small>Próximo exercício</small><strong>{next.title}</strong></div><span>›</span></Link> : <Link className="done-next" href="/aluno/central/diarios/progresso" prefetch><div><small>Desafio concluído</small><strong>Ver progresso do dia</strong></div><span>›</span></Link>}
            {next ? <Link className="done-button" href={`/aluno/central/diarios/${next.exerciseNumber}`} prefetch>Continuar</Link> : <Link className="done-button" href="/aluno/central/diarios/progresso" prefetch>Ver progresso</Link>}
            <Link className="done-link" href="/aluno/central" prefetch>Voltar para Central</Link>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
