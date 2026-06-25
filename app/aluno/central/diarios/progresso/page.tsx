import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { dailyTrainingSteps } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

const totalPoints = dailyTrainingSteps.reduce((sum, step) => sum + step.points, 0);
const completed = 2;
const css = `.progress-daily{min-height:calc(100dvh - 86px);margin:-12px -10px 0;padding:34px 22px;background:radial-gradient(circle at 50% 35%,rgba(38,224,196,.16),transparent 28%),linear-gradient(180deg,#17191c,#090a0c);color:#fff}.progress-daily h1{font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:.96;margin:10px 0 24px}.progress-track{display:flex;align-items:center;gap:8px;margin-bottom:28px}.progress-dot{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,255,255,.16);font-weight:950;color:#8f929a}.progress-dot.done{border-color:#26e0c4;color:#26e0c4}.progress-dot.current{border-color:#f5c76b;color:#f5c76b}.progress-line{height:2px;flex:1;background:rgba(255,255,255,.18)}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.summary-card{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);padding:14px}.summary-card strong{display:block;font-size:24px;color:#f5c76b}.summary-card span{color:#bfc0ca;font-size:11px;font-weight:900}.performance{border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(255,255,255,.04);padding:18px;margin-top:18px}.performance h2{font-size:22px;margin:0 0 16px}.metric{display:grid;grid-template-columns:88px 1fr 42px;align-items:center;gap:10px;margin:14px 0;color:#d8d8df;font-weight:900}.metric-bar{height:8px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}.metric-bar span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#26e0c4,#f5c76b)}.next-day{display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:#fff;border:1px solid rgba(245,199,107,.28);border-radius:22px;padding:16px;background:linear-gradient(90deg,rgba(245,199,107,.12),rgba(255,255,255,.04));margin:24px 0}.next-day small{display:block;color:#f5c76b;font-weight:900}.gold-button{display:block;text-align:center;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#14100a;text-decoration:none;text-transform:uppercase;font-weight:950;padding:17px 20px}.back-link{display:block;text-align:center;color:#f5c76b;margin-top:18px;font-weight:900}`;

export default function DailyProgressPage() {
  return (
    <AppShell>
      <main className="page" style={{ padding: 0 }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <section className="progress-daily">
          <p className="eyebrow">Progresso do dia</p>
          <h1>Dia 5</h1>
          <div className="progress-track">
            {dailyTrainingSteps.map((step) => <><div className={`progress-dot ${step.exerciseNumber <= completed ? 'done' : step.exerciseNumber === completed + 1 ? 'current' : ''}`} key={step.exerciseNumber}>{step.exerciseNumber <= completed ? '✓' : step.exerciseNumber}</div>{step.exerciseNumber < dailyTrainingSteps.length ? <div className="progress-line" /> : null}</>)}
          </div>
          <div className="summary-grid">
            <div className="summary-card"><strong>{totalPoints}</strong><span>Pontos</span></div>
            <div className="summary-card"><strong>12:30</strong><span>Tempo total</span></div>
            <div className="summary-card"><strong>12</strong><span>Sequência</span></div>
          </div>
          <div className="performance">
            <h2>Desempenho</h2>
            {[['Afinação',90],['Respiração',85],['Precisão',88],['Resistência',80]].map(([label, value]) => <div className="metric" key={label}><span>{label}</span><div className="metric-bar"><span style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div>)}
          </div>
          <Link className="next-day" href="/aluno/central/diarios/3" prefetch><div><small>Próximo treino</small><strong>Continuar Dia 5</strong></div><span>›</span></Link>
          <Link className="gold-button" href="/aluno/central/diarios/3" prefetch>Continuar treino</Link>
          <Link className="back-link" href="/aluno/central" prefetch>Voltar para Central</Link>
        </section>
      </main>
    </AppShell>
  );
}
