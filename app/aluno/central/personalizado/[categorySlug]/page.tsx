import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getExercisesByCategory, getTrainingCategory, trainingCategories } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return trainingCategories.map((category) => ({ categorySlug: category.slug }));
}

const uiByCategory: Record<string, { title?: string; icon: string; tone: 'teal' | 'purple' | 'gold' }> = {
  aquecimentos: { title: 'Aquecimento Vocal', icon: '♡', tone: 'teal' },
  afinacao: { icon: '▥', tone: 'teal' },
  'extensao-tessitura': { title: 'Expansão de Extensão', icon: '↗', tone: 'teal' },
  melismas: { title: 'Melismas e Agilidade', icon: '≡', tone: 'purple' },
  percepcao: { icon: '♫', tone: 'purple' },
  respiracao: { icon: '◌', tone: 'teal' },
  'divisao-vocal': { icon: '♪', tone: 'purple' },
};

const css = `.category-page{min-height:100dvh;margin:-24px -16px 0;padding:calc(38px + env(safe-area-inset-top)) 22px calc(42px + env(safe-area-inset-bottom));color:#fff;background:radial-gradient(circle at 18% 4%,rgba(45,227,205,.10),transparent 22%),radial-gradient(circle at 82% 18%,rgba(45,227,205,.08),transparent 26%),linear-gradient(180deg,#071014 0%,#05080b 48%,#030405 100%);overflow-x:hidden}.category-inner{max-width:760px;margin:0 auto}.category-top{display:grid;grid-template-columns:46px 1fr 46px;align-items:center;margin-bottom:30px}.top-icon{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.035);color:#ddd;display:grid;place-items:center;text-decoration:none;font-size:26px}.top-title{text-align:center;text-transform:uppercase;letter-spacing:.30em;color:#31dfc9;font-size:14px;font-weight:950}.category-hero{position:relative;overflow:hidden;border:1px solid rgba(49,223,201,.22);border-radius:28px;padding:32px 30px;background:radial-gradient(circle at 20% 18%,rgba(49,223,201,.16),transparent 28%),linear-gradient(145deg,rgba(12,32,35,.78),rgba(255,255,255,.025));box-shadow:0 28px 80px rgba(0,0,0,.30)}.category-hero:after{content:'';position:absolute;right:-26px;top:58px;width:300px;height:110px;background:repeating-radial-gradient(ellipse at center,rgba(49,223,201,.24) 0 1px,transparent 2px 9px);mask-image:linear-gradient(90deg,transparent,black 22%,black 75%,transparent);opacity:.50}.hero-grid{position:relative;z-index:1;display:grid;grid-template-columns:94px minmax(0,1fr);gap:24px;align-items:start}.hero-orb{width:92px;height:92px;border-radius:28px;border:1px solid rgba(49,223,201,.42);background:rgba(49,223,201,.06);display:grid;place-items:center;color:#42e3cf;font-size:50px;text-shadow:0 0 30px rgba(49,223,201,.4)}.category-hero h1{margin:0;font-size:clamp(34px,7vw,50px);line-height:1.05;letter-spacing:-.04em}.category-hero p{margin:15px 0 0;color:rgba(255,255,255,.68);font-size:17px;line-height:1.45;max-width:470px}.hero-meta{position:relative;z-index:1;margin-top:26px;display:flex;gap:10px;flex-wrap:wrap}.hero-meta span{border:1px solid rgba(49,223,201,.25);background:rgba(49,223,201,.07);color:#31dfc9;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.section-head{margin:30px 0 16px}.section-head h2{margin:0;font-size:26px}.section-head p{margin:8px 0 0;color:rgba(255,255,255,.60);font-size:16px}.exercise-list{display:grid;gap:14px}.exercise-card{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:14px;align-items:center;border:1px solid rgba(255,255,255,.09);border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.024));padding:18px;text-decoration:none;color:#fff;box-shadow:0 18px 62px rgba(0,0,0,.20)}.exercise-card h3{margin:0 0 9px;font-size:22px;line-height:1.1}.exercise-card p{margin:0;color:rgba(255,255,255,.60);font-size:15px;line-height:1.42}.exercise-topline{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px;color:rgba(255,255,255,.56);font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.exercise-topline strong{color:#31dfc9}.tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.tags span{border:1px solid rgba(49,223,201,.25);border-radius:999px;color:#31dfc9;background:rgba(49,223,201,.06);padding:6px 8px;font-size:10px;font-weight:900}.exercise-arrow{width:42px;height:42px;border-radius:50%;border:1px solid rgba(49,223,201,.62);display:grid;place-items:center;color:#31dfc9;font-size:30px}.empty-card{border:1px dashed rgba(255,255,255,.14);border-radius:22px;padding:22px;color:rgba(255,255,255,.65)}@media(max-width:640px){.category-page{margin:-16px -12px 0;padding:calc(32px + env(safe-area-inset-top)) 20px calc(34px + env(safe-area-inset-bottom))}.category-hero{padding:27px 24px}.hero-grid{grid-template-columns:1fr}.hero-orb{width:78px;height:78px;font-size:42px}.category-hero h1{font-size:34px}.category-hero p{font-size:16px}.exercise-card{padding:16px}.exercise-card h3{font-size:20px}}`;

type PageProps = { params: Promise<{ categorySlug: string }> | { categorySlug: string } };

export default async function PersonalizedCategoryPage({ params }: PageProps) {
  const resolvedParams = await params;
  const category = getTrainingCategory(resolvedParams.categorySlug);
  if (!category) notFound();
  const exercises = getExercisesByCategory(category.slug);
  const ui = uiByCategory[category.slug] ?? { icon: category.icon, tone: 'teal' as const };
  const title = ui.title ?? category.title;

  return (
    <AppShell hideNav>
      <main className="category-page">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="category-inner">
          <header className="category-top"><Link href="/aluno/central/personalizado" className="top-icon" prefetch aria-label="Voltar">‹</Link><div className="top-title">Personalizado</div><div className="top-icon" aria-label="Informações">i</div></header>
          <section className="category-hero"><div className="hero-grid"><div className="hero-orb">{ui.icon}</div><div><h1>{title}</h1><p>{category.description}</p></div></div><div className="hero-meta"><span>{category.subtitle}</span><span>{exercises.length} treino{exercises.length === 1 ? '' : 's'}</span><span>Adaptado à tessitura</span></div></section>
          <section><div className="section-head"><h2>Exercícios da categoria</h2><p>Escolha uma função e abra o player premium do exercício.</p></div><div className="exercise-list">{exercises.length ? exercises.map((exercise) => <Link className="exercise-card" href={`/aluno/central/${exercise.slug}`} key={exercise.slug} prefetch><div><div className="exercise-topline"><span>{exercise.level}</span><strong>{exercise.durationLabel}</strong></div><h3>{exercise.title}</h3><p>{exercise.description}</p><div className="tags">{exercise.focus.map((tag) => <span key={tag}>{tag}</span>)}</div></div><span className="exercise-arrow">›</span></Link>) : <div className="empty-card">Ainda não há exercícios cadastrados nessa categoria.</div>}</div></section>
        </div>
      </main>
    </AppShell>
  );
}
