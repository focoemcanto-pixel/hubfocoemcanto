import Link from 'next/link';
import type { CSSProperties } from 'react';
import { AppShell } from '@/components/app-shell';
import { getExercisesByCategory, trainingCategories, trainingExercises } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

const css = `.training-center{max-width:1180px}.training-hero{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:32px;padding:42px 44px;min-height:310px;background:radial-gradient(circle at 76% 30%,rgba(245,199,107,.25),transparent 36%),linear-gradient(120deg,#09090d,#1f160b 52%,#07070b);box-shadow:0 34px 110px rgba(0,0,0,.48)}.training-hero:before{content:'';position:absolute;inset:auto -10% -45% 40%;height:280px;border-radius:999px;background:rgba(245,199,107,.08);filter:blur(20px)}.training-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(44px,6.2vw,72px);line-height:.9;margin:12px 0 14px;letter-spacing:-.055em;max-width:760px}.training-hero p:not(.eyebrow){max-width:560px;color:#bfc0ca;line-height:1.5}.training-hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.training-button{display:inline-flex;gap:8px;padding:13px 20px;border-radius:18px;font-weight:950;text-decoration:none}.training-button.gold{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.training-button.dark{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12)}.training-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:22px;max-width:640px}.training-stat{border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:13px;background:rgba(255,255,255,.045)}.training-stat strong{display:block;font-size:24px;color:#f5c76b}.training-stat span{color:#bfc0ca;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.training-section{margin-top:22px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:rgba(255,255,255,.035);padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.22)}.training-section-heading{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:16px}.training-section-heading h2{margin:0;font-size:28px}.training-section-heading p{margin:4px 0 0;color:#aeb0bc}.category-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.category-card{min-height:260px;position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:18px;color:#fff;text-decoration:none;background:var(--training-gradient);display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 22px 70px rgba(0,0,0,.24)}.category-card:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.56) 55%,rgba(0,0,0,.90));pointer-events:none}.category-card>*{position:relative;z-index:1}.category-icon{font-size:34px}.category-card h3{font-family:Georgia,'Times New Roman',serif;text-transform:uppercase;font-size:26px;line-height:.95;letter-spacing:-.04em;margin:12px 0 8px}.category-card p{color:rgba(255,255,255,.74);font-size:13px;line-height:1.35;margin:0}.category-meta{display:flex;justify-content:space-between;gap:10px;color:#f5c76b;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.exercise-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.exercise-card{border:1px solid rgba(255,255,255,.12);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));padding:16px;text-decoration:none;color:#fff;display:grid;gap:12px}.exercise-card h3{font-size:21px;margin:0;line-height:1.1}.exercise-card p{margin:0;color:#bfc0ca;line-height:1.42}.exercise-tags{display:flex;flex-wrap:wrap;gap:8px}.exercise-tags span{border:1px solid rgba(245,199,107,.26);background:rgba(245,199,107,.08);color:#f5c76b;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900}.exercise-footer{display:flex;justify-content:space-between;align-items:center;color:#c7c7d1;font-size:12px;font-weight:900}.exercise-footer strong{color:#f5c76b}@media(max-width:1040px){.category-grid{grid-template-columns:repeat(3,1fr)}.exercise-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.training-hero{padding:28px 22px;min-height:auto}.training-hero h1{font-size:44px}.training-stats{grid-template-columns:1fr}.training-section{padding:18px 0 18px 18px;overflow:hidden}.training-section-heading{padding-right:18px}.category-grid,.exercise-grid{display:flex;overflow-x:auto;gap:14px;scroll-snap-type:x mandatory;padding:0 18px 8px 0;margin-right:-18px;-webkit-overflow-scrolling:touch}.category-grid::-webkit-scrollbar,.exercise-grid::-webkit-scrollbar{display:none}.category-card{flex:0 0 min(78vw,300px);min-height:300px}.exercise-card{flex:0 0 min(82vw,320px)}}`;

type TrainingGradientStyle = CSSProperties & { '--training-gradient': string };

export default function TrainingCenterPage() {
  const highlightedExercises = trainingExercises.slice(0, 3);

  return (
    <AppShell>
      <main className="page training-center">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <section className="training-hero">
          <p className="eyebrow">Central de Treinamento ★</p>
          <h1>Treine sua voz com guia visual.</h1>
          <p>Vocalizes, segunda voz, respiração, tessitura e melismas organizados por objetivo. Aqui o aluno não só assiste: ele pratica com direção.</p>
          <div className="training-hero-actions">
            <a className="training-button gold" href="#categorias">Escolher objetivo</a>
            <a className="training-button dark" href="#recomendados">Ver treinos guiados</a>
          </div>
          <div className="training-stats">
            <div className="training-stat"><strong>{trainingCategories.length}</strong><span>objetivos</span></div>
            <div className="training-stat"><strong>{trainingExercises.length}</strong><span>treinos iniciais</span></div>
            <div className="training-stat"><strong>100%</strong><span>reutilizável nos cursos</span></div>
          </div>
        </section>

        <section className="training-section" id="categorias">
          <div className="training-section-heading"><div><p className="eyebrow">Objetivos de treino</p><h2>Escolha o que precisa desenvolver</h2></div></div>
          <div className="category-grid">
            {trainingCategories.map((category) => {
              const total = getExercisesByCategory(category.slug).length;
              const style = { '--training-gradient': category.gradient } as TrainingGradientStyle;
              return (
                <Link className="category-card" href={`#${category.slug}`} key={category.slug} style={style}>
                  <div><div className="category-icon">{category.icon}</div><h3>{category.title}</h3><p>{category.description}</p></div>
                  <div className="category-meta"><span>{category.subtitle}</span><span>{total} treino{total === 1 ? '' : 's'}</span></div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="training-section" id="recomendados">
          <div className="training-section-heading"><div><p className="eyebrow">Comece por aqui</p><h2>Treinos guiados recomendados</h2></div></div>
          <div className="exercise-grid">
            {highlightedExercises.map((exercise) => (
              <Link className="exercise-card" href={`/aluno/central/${exercise.slug}`} key={exercise.slug}>
                <div className="exercise-footer"><span>{exercise.level}</span><strong>{exercise.durationLabel}</strong></div>
                <h3>{exercise.title}</h3>
                <p>{exercise.objective}</p>
                <div className="exercise-tags">{exercise.focus.map((tag) => <span key={tag}>{tag}</span>)}</div>
              </Link>
            ))}
          </div>
        </section>

        {trainingCategories.map((category) => {
          const exercises = getExercisesByCategory(category.slug);
          return (
            <section className="training-section" id={category.slug} key={category.slug}>
              <div className="training-section-heading"><div><p className="eyebrow">{category.subtitle}</p><h2>{category.title}</h2></div></div>
              <div className="exercise-grid">
                {exercises.map((exercise) => (
                  <Link className="exercise-card" href={`/aluno/central/${exercise.slug}`} key={exercise.slug}>
                    <div className="exercise-footer"><span>{exercise.level}</span><strong>{exercise.durationLabel}</strong></div>
                    <h3>{exercise.title}</h3>
                    <p>{exercise.description}</p>
                    <div className="exercise-tags">{exercise.focus.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </AppShell>
  );
}
