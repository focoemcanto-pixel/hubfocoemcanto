import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { GuidedTrainingPlayer } from '@/components/guided-training-player';
import { getTrainingCategory, getTrainingExercise } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

const css = `.training-exercise-page{max-width:1080px}.training-back{display:inline-flex;margin-bottom:16px;color:#f5c76b;text-decoration:none;font-weight:950}.training-exercise-hero{border:1px solid rgba(255,255,255,.14);border-radius:30px;background:radial-gradient(circle at 75% 25%,rgba(245,199,107,.2),transparent 36%),linear-gradient(120deg,#09090d,#171109 58%,#07070b);padding:30px;box-shadow:0 30px 90px rgba(0,0,0,.34);margin-bottom:20px}.training-exercise-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(40px,5.4vw,66px);line-height:.92;margin:10px 0 12px;letter-spacing:-.055em}.training-exercise-hero p:not(.eyebrow){max-width:700px;color:#bfc0ca;line-height:1.5}.training-meta-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.training-meta-row span{border:1px solid rgba(245,199,107,.28);background:rgba(245,199,107,.08);color:#f5c76b;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:950}.training-guidance-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;margin-top:20px}.training-guidance-card{border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(255,255,255,.035);padding:18px}.training-guidance-card h2{margin:0 0 10px;font-size:22px}.training-guidance-card p,.training-guidance-card li{color:#bfc0ca;line-height:1.5}.training-guidance-card ul{margin:0;padding-left:18px}.training-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}.training-actions a{display:inline-flex;border-radius:16px;padding:12px 16px;text-decoration:none;font-weight:950}.training-actions .gold{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.training-actions .dark{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12)}@media(max-width:760px){.training-exercise-hero{padding:24px 20px}.training-guidance-grid{grid-template-columns:1fr}}`;

export default async function TrainingExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exercise = getTrainingExercise(slug);
  if (!exercise) notFound();
  const category = getTrainingCategory(exercise.categorySlug);

  return (
    <AppShell hideNav>
      <main className="page training-exercise-page">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <Link href="/aluno/central/personalizado" className="training-back" prefetch>← Voltar para Personalizado</Link>
        <section className="training-exercise-hero">
          <p className="eyebrow">{category?.title || 'Treino guiado'} • {exercise.level}</p>
          <h1>{exercise.title}</h1>
          <p>{exercise.description}</p>
          <div className="training-meta-row">
            <span>{exercise.durationLabel}</span>
            <span>{exercise.bpm} BPM</span>
            {exercise.focus.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </section>
        <GuidedTrainingPlayer exercise={exercise} />
        <section className="training-guidance-grid">
          <div className="training-guidance-card"><h2>Como praticar</h2><p>{exercise.objective}</p><ul><li>Assista o movimento das bolinhas antes de cantar.</li><li>Depois cante junto, buscando chegar na nota no momento exato da luz.</li><li>Use velocidade menor quando precisar ganhar controle.</li></ul></div>
          <div className="training-guidance-card"><h2>Depois do treino</h2><p>Grave sua execução e envie para avaliação quando quiser validar se cumpriu o objetivo técnico.</p><div className="training-actions"><Link className="gold" href="/aluno/enviar" prefetch>Enviar atividade</Link><Link className="dark" href="/aluno/comunidade" prefetch>Ver comunidade</Link></div></div>
        </section>
      </main>
    </AppShell>
  );
}
