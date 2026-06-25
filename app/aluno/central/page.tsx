import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { dailyTrainingSteps, getExercisesByCategory, trainingCategories, trainingExercises } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

type TrainingGradientStyle = CSSProperties & { '--training-gradient': string };

const css = `.training-center{max-width:1180px}.training-hero{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:32px;padding:42px 44px;background:radial-gradient(circle at 78% 18%,rgba(245,199,107,.22),transparent 32%),linear-gradient(145deg,#06070a,#111820 54%,#050506);box-shadow:0 34px 110px rgba(0,0,0,.48)}.training-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(46px,6.8vw,76px);line-height:.9;margin:14px 0 12px;letter-spacing:-.06em}.training-hero p:not(.eyebrow){max-width:560px;color:#bfc0ca;line-height:1.5}.mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:26px}.mode-card{position:relative;overflow:hidden;border-radius:24px;padding:20px;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.14);background:linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.025));min-height:156px;display:grid;align-content:space-between}.mode-card.daily{border-color:rgba(245,199,107,.55);box-shadow:0 0 48px rgba(245,199,107,.09)}.mode-card.custom{border-color:rgba(38,224,196,.45)}.mode-card strong{display:block;text-transform:uppercase;font-size:20px;letter-spacing:.02em}.mode-card p{color:#c9cbd3;margin:8px 0 0;line-height:1.36}.mode-icon{font-size:34px;color:#f5c76b}.mode-card.custom .mode-icon{color:#26e0c4}.mode-arrow{position:absolute;right:20px;top:50%;transform:translateY(-50%);font-size:34px;color:#fff}.today-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.today-progress div{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.045);padding:14px}.today-progress strong{display:block;color:#f5c76b;font-size:25px}.today-progress span{color:#bfc0ca;text-transform:uppercase;font-size:11px;font-weight:900;letter-spacing:.08em}.daily-preview{margin-top:22px;border:1px solid rgba(245,199,107,.18);border-radius:28px;background:linear-gradient(135deg,rgba(245,199,107,.1),rgba(255,255,255,.025));padding:18px}.daily-preview-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.daily-preview-head h2{margin:0;font-size:28px}.daily-preview-head a{color:#f5c76b;font-weight:950;text-decoration:none}.daily-track{display:flex;align-items:center;gap:8px;margin:8px 0 16px}.daily-dot{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,255,255,.18);font-weight:950;color:#8d9098}.daily-dot.done{border-color:#26e0c4;color:#26e0c4}.daily-dot.current{border-color:#f5c76b;color:#f5c76b;box-shadow:0 0 24px rgba(245,199,107,.18)}.daily-line{height:2px;flex:1;background:rgba(255,255,255,.18)}.daily-current-card{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:rgba(0,0,0,.18);padding:16px;text-decoration:none;color:#fff}.daily-current-card small{display:block;color:#f5c76b;font-weight:950}.daily-current-card h3{margin:4px 0 4px}.daily-current-card p{margin:0;color:#c8cad2}.training-section{margin-top:22px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:rgba(255,255,255,.035);padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.22)}.training-section-heading{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:16px}.training-section-heading h2{margin:0;font-size:28px}.training-section-heading p{margin:4px 0 0;color:#aeb0bc}.category-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.category-card{min-height:260px;position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:18px;color:#fff;text-decoration:none;background:var(--training-gradient);display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 22px 70px rgba(0,0,0,.24)}.category-card:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.56) 55%,rgba(0,0,0,.90));pointer-events:none}.category-card>*{position:relative;z-index:1}.category-icon{font-size:34px}.category-card h3{font-family:Georgia,'Times New Roman',serif;text-transform:uppercase;font-size:26px;line-height:.95;letter-spacing:-.04em;margin:12px 0 8px}.category-card p{color:rgba(255,255,255,.74);font-size:13px;line-height:1.35;margin:0}.category-meta{display:flex;justify-content:space-between;gap:10px;color:#f5c76b;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.exercise-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.exercise-card{border:1px solid rgba(255,255,255,.12);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));padding:16px;text-decoration:none;color:#fff;display:grid;gap:12px}.exercise-card h3{font-size:21px;margin:0;line-height:1.1}.exercise-card p{margin:0;color:#bfc0ca;line-height:1.42}.exercise-tags{display:flex;flex-wrap:wrap;gap:8px}.exercise-tags span{border:1px solid rgba(245,199,107,.26);background:rgba(245,199,107,.08);color:#f5c76b;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900}.exercise-footer{display:flex;justify-content:space-between;align-items:center;color:#c7c7d1;font-size:12px;font-weight:900}.exercise-footer strong{color:#f5c76b}@media(max-width:1040px){.category-grid{grid-template-columns:repeat(3,1fr)}.exercise-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.training-hero{padding:30px 22px}.training-hero h1{font-size:48px}.mode-grid{grid-template-columns:1fr}.today-progress{grid-template-columns:repeat(3,1fr)}.today-progress div{padding:12px 10px}.training-section,.daily-preview{padding:18px 0 18px 18px;overflow:hidden}.daily-preview-head,.training-section-heading{padding-right:18px}.category-grid,.exercise-grid{display:flex;overflow-x:auto;gap:14px;scroll-snap-type:x mandatory;padding:0 18px 8px 0;margin-right:-18px;-webkit-overflow-scrolling:touch}.category-grid::-webkit-scrollbar,.exercise-grid::-webkit-scrollbar{display:none}.category-card{flex:0 0 min(78vw,300px);min-height:300px}.exercise-card{flex:0 0 min(82vw,320px)}}`;

export default function TrainingCenterPage() {
  const highlightedExercises = trainingExercises.slice(0, 3);
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
            <a className="mode-card custom" href="#personalizado"><div><div className="mode-icon">≋</div><strong>Personalizado</strong><p>Escolha o objetivo, o exercício e personalize seu treino.</p></div><span className="mode-arrow">›</span></a>
          </div>
          <div className="today-progress"><div><strong>12</strong><span>Sequência</span></div><div><strong>1/{dailyTrainingSteps.length}</strong><span>Treinos</span></div><div><strong>240</strong><span>Pontos</span></div></div>
        </section>

        <section className="daily-preview">
          <div className="daily-preview-head"><div><p className="eyebrow">Desafio diário</p><h2>Dia {currentStep.day}</h2></div><Link href="/aluno/central/diarios/progresso" prefetch>Ver progresso →</Link></div>
          <div className="daily-track">{dailyTrainingSteps.map((step) => <div className="daily-dot current" key={step.exerciseNumber}>{step.exerciseNumber}</div>).reduce((acc, item, index) => index === 0 ? [item] : [...acc, <div className="daily-line" key={`line-${index}`} />, item], [] as ReactNode[])}</div>
          <Link className="daily-current-card" href="/aluno/central/diarios/1" prefetch><div><small>Próximo exercício</small><h3>{currentStep.title}</h3><p>{currentStep.subtitle}</p></div><span>Iniciar ›</span></Link>
        </section>

        <section className="training-section" id="personalizado">
          <div className="training-section-heading"><div><p className="eyebrow">Personalizado</p><h2>Escolha o que precisa desenvolver</h2></div></div>
          <div className="category-grid">
            {trainingCategories.map((category) => {
              const total = getExercisesByCategory(category.slug).length;
              const style = { '--training-gradient': category.gradient } as TrainingGradientStyle;
              return <Link className="category-card" href={`#${category.slug}`} key={category.slug} style={style}><div><div className="category-icon">{category.icon}</div><h3>{category.title}</h3><p>{category.description}</p></div><div className="category-meta"><span>{category.subtitle}</span><span>{total} treino{total === 1 ? '' : 's'}</span></div></Link>;
            })}
          </div>
        </section>

        <section className="training-section" id="recomendados"><div className="training-section-heading"><div><p className="eyebrow">Comece por aqui</p><h2>Treinos guiados recomendados</h2></div></div><div className="exercise-grid">{highlightedExercises.map((exercise) => <Link className="exercise-card" href={`/aluno/central/${exercise.slug}`} key={exercise.slug}><div className="exercise-footer"><span>{exercise.level}</span><strong>{exercise.durationLabel}</strong></div><h3>{exercise.title}</h3><p>{exercise.objective}</p><div className="exercise-tags">{exercise.focus.map((tag) => <span key={tag}>{tag}</span>)}</div></Link>)}</div></section>

        {trainingCategories.map((category) => {
          const exercises = getExercisesByCategory(category.slug);
          return <section className="training-section" id={category.slug} key={category.slug}><div className="training-section-heading"><div><p className="eyebrow">{category.subtitle}</p><h2>{category.title}</h2></div></div><div className="exercise-grid">{exercises.map((exercise) => <Link className="exercise-card" href={`/aluno/central/${exercise.slug}`} key={exercise.slug}><div className="exercise-footer"><span>{exercise.level}</span><strong>{exercise.durationLabel}</strong></div><h3>{exercise.title}</h3><p>{exercise.description}</p><div className="exercise-tags">{exercise.focus.map((tag) => <span key={tag}>{tag}</span>)}</div></Link>)}</div></section>;
        })}
      </main>
    </AppShell>
  );
}
