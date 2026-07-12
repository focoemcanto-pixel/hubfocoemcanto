'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';

type Challenge = {
  id: string;
  slug: string;
  title: string;
  theme: string;
  description: string;
  instructions: string[];
  duration_minutes: number;
  level: string;
  starts_at: string;
  ends_at: string;
};

export default function WeeklyChallengePage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [completed, setCompleted] = useState(false);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/weekly-challenges', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível carregar o desafio.');
        setChallenge(data.challenge || null);
        setCompleted(Boolean(data.completed));
        setTotalCompleted(Number(data.totalCompleted || 0));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const period = useMemo(() => {
    if (!challenge) return '';
    const start = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(challenge.starts_at));
    const end = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(challenge.ends_at));
    return `${start} — ${end}`;
  }, [challenge]);

  async function completeChallenge() {
    if (!challenge || saving || completed) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/weekly-challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível concluir o desafio.');
      setCompleted(true);
      setTotalCompleted((value) => value + 1);
    } catch (err: any) {
      setError(err.message || 'Não foi possível concluir o desafio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <main className="weekly-page">
        <style>{css}</style>
        <div className="weekly-wrap">
          <header className="weekly-header">
            <Link href="/aluno/central" className="back">← Central de Treinamento</Link>
            <div className="weekly-kicker">DESAFIO VOCAL DA SEMANA ✦</div>
            <h1>Transforme a aula em <span>prática.</span></h1>
            <p>Um treino curto, guiado e objetivo para aplicar o tema da Quarta Vocal na sua própria voz.</p>
          </header>

          {loading ? <section className="state-card">Preparando seu desafio...</section> : error ? <section className="state-card error">{error}</section> : !challenge ? <section className="state-card"><h2>Novo desafio em preparação</h2><p>Volte depois da próxima Quarta Vocal para acessar a atividade da semana.</p></section> : (
            <>
              <section className={`challenge-card ${completed ? 'done' : ''}`}>
                <div className="challenge-top">
                  <div>
                    <div className="pills"><span>🔥 Semana atual</span><span>⏱ {challenge.duration_minutes} minutos</span><span>🎯 {challenge.level}</span></div>
                    <h2>{challenge.title}</h2>
                    <p className="period">{period}</p>
                  </div>
                  <div className="seal">{completed ? '✓' : '01'}</div>
                </div>

                <p className="description">{challenge.description}</p>

                <div className="steps">
                  {challenge.instructions.map((instruction, index) => (
                    <article className="step" key={`${index}-${instruction}`}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <p>{instruction}</p>
                    </article>
                  ))}
                </div>

                <button className="complete" disabled={saving || completed} onClick={completeChallenge}>
                  {completed ? '✓ Desafio concluído' : saving ? 'Salvando...' : 'Concluir desafio'}
                </button>
                {completed && <div className="success">Excelente! Você concluiu o desafio desta semana e registrou mais uma prática na sua jornada vocal.</div>}
              </section>

              <section className="progress">
                <div><span>SEU PROGRESSO</span><strong>{totalCompleted}</strong><p>desafios concluídos</p></div>
                <div className="progress-copy"><h3>Consistência transforma a voz.</h3><p>Volte toda semana para aplicar o conteúdo da live e construir evolução com prática real.</p></div>
              </section>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

const css = `
.weekly-page{min-height:100dvh;margin:-24px -16px 0;padding:36px 20px 120px;color:#fff;background:radial-gradient(circle at 84% 8%,rgba(245,199,107,.18),transparent 24%),radial-gradient(circle at 12% 72%,rgba(169,109,255,.10),transparent 28%),linear-gradient(180deg,#171717,#08090b 54%,#030304)}
.weekly-wrap{width:min(820px,100%);margin:0 auto}.weekly-header{padding:28px 0 34px}.back{display:inline-flex;color:rgba(255,255,255,.62);text-decoration:none;font-weight:800;margin-bottom:34px}.weekly-kicker{color:#f5c76b;font-size:12px;letter-spacing:.24em;font-weight:950;margin-bottom:16px}.weekly-header h1{font:700 clamp(46px,8vw,72px)/.95 Georgia,serif;letter-spacing:-.055em;margin:0 0 18px;max-width:650px}.weekly-header h1 span{color:#f5c76b}.weekly-header>p{max-width:620px;color:rgba(255,255,255,.68);font-size:18px;line-height:1.6}.challenge-card,.progress,.state-card{border:1px solid rgba(245,199,107,.22);background:linear-gradient(145deg,rgba(255,255,255,.065),rgba(255,255,255,.018));box-shadow:0 32px 100px rgba(0,0,0,.34);border-radius:30px}.challenge-card{padding:30px}.challenge-card.done{border-color:rgba(69,230,204,.32)}.challenge-top{display:flex;justify-content:space-between;gap:22px;align-items:flex-start}.pills{display:flex;gap:8px;flex-wrap:wrap}.pills span{border:1px solid rgba(245,199,107,.25);background:rgba(245,199,107,.08);color:#f5c76b;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900}.challenge-card h2{font-size:34px;line-height:1.05;margin:20px 0 6px}.period{color:rgba(255,255,255,.46);margin:0;font-weight:800}.seal{width:66px;height:66px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(245,199,107,.4);color:#f5c76b;font:700 24px Georgia,serif;box-shadow:0 0 40px rgba(245,199,107,.12)}.description{font-size:17px;line-height:1.65;color:rgba(255,255,255,.72);margin:28px 0}.steps{display:grid;gap:12px}.step{display:grid;grid-template-columns:48px 1fr;gap:16px;align-items:center;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.2);border-radius:18px;padding:15px}.step span{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:rgba(245,199,107,.1);color:#f5c76b;font-weight:950}.step p{margin:0;color:rgba(255,255,255,.82);line-height:1.5}.complete{width:100%;margin-top:22px;border:0;border-radius:17px;padding:17px;color:#17120a;background:linear-gradient(135deg,#ffe6a1,#f5c76b);font-weight:950;font-size:16px;cursor:pointer;box-shadow:0 18px 44px rgba(245,199,107,.16)}.complete:disabled{cursor:default;opacity:.72}.success{margin-top:14px;padding:16px;border-radius:16px;background:rgba(69,230,204,.1);border:1px solid rgba(69,230,204,.24);color:#baf8ed;line-height:1.5}.progress{display:grid;grid-template-columns:180px 1fr;gap:26px;align-items:center;margin-top:20px;padding:24px 28px}.progress span{color:#f5c76b;font-size:11px;letter-spacing:.18em;font-weight:950}.progress strong{display:block;font-size:54px;line-height:1;margin:8px 0}.progress p{margin:0;color:rgba(255,255,255,.56)}.progress h3{margin:0 0 8px;font-size:22px}.state-card{padding:34px;text-align:center;color:rgba(255,255,255,.7)}.state-card.error{border-color:rgba(239,68,68,.28);color:#fecaca}
@media(max-width:640px){.weekly-page{margin:-16px -12px 0;padding:26px 18px 110px}.challenge-card{padding:22px 18px}.challenge-top{display:block}.seal{margin-top:18px}.challenge-card h2{font-size:29px}.progress{grid-template-columns:1fr}.weekly-header h1{font-size:49px}}
`;
