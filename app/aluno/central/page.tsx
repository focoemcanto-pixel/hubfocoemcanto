import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { TrainingCenterDailyMetric, TrainingCenterProgressCard } from '@/components/training-center-real-stats';

export const dynamic = 'force-dynamic';

const css = `.training-center-premium{min-height:100dvh;margin:-24px -16px 0;padding:calc(34px + env(safe-area-inset-top)) 22px calc(116px + env(safe-area-inset-bottom));color:#fff;background:radial-gradient(circle at 84% 10%,rgba(245,199,107,.16),transparent 22%),radial-gradient(circle at 20% 78%,rgba(38,224,196,.06),transparent 26%),linear-gradient(180deg,#171717 0%,#090a0c 55%,#030304 100%);overflow-x:hidden}.training-center-inner{width:100%;max-width:760px;margin:0 auto}.premium-hero{position:relative;min-height:312px;display:grid;align-items:center;padding:18px 0 28px;overflow:hidden}.premium-hero:after{content:'';position:absolute;right:-14px;top:10px;width:270px;height:270px;border-radius:50%;border:1px solid rgba(245,199,107,.26);background:radial-gradient(circle at 62% 42%,rgba(245,199,107,.23),transparent 32%),linear-gradient(135deg,rgba(255,255,255,.035),transparent);box-shadow:0 0 90px rgba(245,199,107,.14)}.premium-hero:before{content:'🎙';position:absolute;right:42px;top:76px;z-index:1;font-size:116px;filter:sepia(1) saturate(1.8) hue-rotate(350deg) drop-shadow(0 0 34px rgba(245,199,107,.35));opacity:.78}.premium-hero>div{position:relative;z-index:2}.premium-eyebrow{font-size:13px;letter-spacing:.26em;text-transform:uppercase;color:#f5c76b;font-weight:950;margin:0 0 28px;text-shadow:0 0 24px rgba(245,199,107,.22)}.premium-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(50px,10vw,72px);line-height:.93;letter-spacing:-.06em;margin:0 0 22px;max-width:490px;text-shadow:0 16px 60px rgba(0,0,0,.55)}.premium-hero h1 span{color:#f5c76b}.premium-hero p:not(.premium-eyebrow){max-width:470px;color:rgba(255,255,255,.72);font-size:18px;line-height:1.55;margin:0}.premium-section-title{margin:18px 0 14px;color:#f5c76b;text-transform:uppercase;letter-spacing:.24em;font-weight:950;font-size:13px}.path-grid{display:grid;gap:16px}.path-card{position:relative;overflow:hidden;width:100%;display:grid;grid-template-columns:96px minmax(0,1fr) 54px;gap:20px;align-items:center;min-height:156px;padding:26px;border-radius:24px;text-decoration:none;color:#fff;border:1px solid rgba(245,199,107,.24);background:radial-gradient(circle at 84% 15%,rgba(245,199,107,.11),transparent 36%),linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018));box-shadow:0 26px 80px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.04);box-sizing:border-box}.path-card:before{content:'';position:absolute;inset:0;background:linear-gradient(110deg,rgba(255,255,255,.08),transparent 38%,rgba(255,255,255,.02));opacity:.58;pointer-events:none}.path-card.custom{border-color:rgba(38,224,196,.24);background:radial-gradient(circle at 84% 15%,rgba(38,224,196,.13),transparent 38%),linear-gradient(135deg,rgba(20,55,53,.42),rgba(255,255,255,.018))}.path-card.repertoire{border-color:rgba(168,105,255,.25);background:radial-gradient(circle at 84% 15%,rgba(168,105,255,.14),transparent 38%),linear-gradient(135deg,rgba(48,31,77,.40),rgba(255,255,255,.018))}.path-icon{position:relative;z-index:1;width:96px;height:96px;border-radius:20px;display:grid;place-items:center;border:1px solid rgba(245,199,107,.29);background:linear-gradient(145deg,rgba(245,199,107,.10),rgba(255,255,255,.025));font-size:42px;color:#f5c76b;box-shadow:inset 0 0 30px rgba(245,199,107,.06)}.path-card.custom .path-icon{border-color:rgba(38,224,196,.36);color:#45e6cc;background:linear-gradient(145deg,rgba(38,224,196,.13),rgba(255,255,255,.025))}.path-card.repertoire .path-icon{border-color:rgba(168,105,255,.36);color:#a96dff;background:linear-gradient(145deg,rgba(168,105,255,.15),rgba(255,255,255,.025))}.path-content{position:relative;z-index:1;min-width:0}.path-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.path-card h2{font-size:26px;text-transform:uppercase;letter-spacing:.02em;margin:0;font-weight:950;line-height:1.12}.new-pill{border:1px solid rgba(245,199,107,.38);background:rgba(245,199,107,.14);color:#f5c76b;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:950}.path-card p{margin:12px 0 0;color:rgba(255,255,255,.68);font-size:18px;line-height:1.45;max-width:100%}.path-metric{margin-top:20px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.035);padding:12px 14px;display:flex;align-items:center;gap:12px;color:rgba(255,255,255,.70);font-size:15px;min-width:0}.path-metric strong{color:#f5c76b;font-size:20px;margin-right:2px}.mini-track{margin-left:auto;display:flex;align-items:center;gap:7px;min-width:0}.mini-track i{display:block;width:32px;height:7px;border-radius:999px;background:rgba(255,255,255,.12);box-shadow:none}.mini-track i.done{background:rgba(245,199,107,.95);box-shadow:0 0 14px rgba(245,199,107,.34)}.path-arrow{position:relative;z-index:1;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor;color:#f5c76b;font-size:44px;line-height:1;box-shadow:0 0 28px rgba(245,199,107,.09);justify-self:end}.path-card.custom .path-arrow{color:#45e6cc}.path-card.repertoire .path-arrow{color:#a96dff}.progress-card{margin-top:22px;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.025));padding:24px 26px;box-shadow:0 22px 70px rgba(0,0,0,.25);overflow:hidden}.progress-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}.progress-head h2{margin:0;text-transform:uppercase;letter-spacing:.08em;font-size:16px;color:#f5c76b}.report-button{border:1px solid rgba(245,199,107,.34);border-radius:999px;color:#f5c76b;text-decoration:none;padding:10px 14px;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0}.stat-item{text-align:center;padding:0 12px;border-right:1px solid rgba(255,255,255,.10);min-width:0}.stat-item:last-child{border-right:0}.stat-icon{font-size:28px;margin-bottom:10px}.stat-value{display:block;font-size:36px;font-weight:950;line-height:1}.stat-value.green{color:#67d84f}.stat-value.orange{color:#ff8c32}.stat-value.blue{color:#4db8ff}.stat-value.gold{color:#f5c76b}.stat-label{display:block;margin-top:6px;color:rgba(255,255,255,.67);font-size:14px;line-height:1.25}.progress-foot{margin-top:18px;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;display:flex;gap:10px;flex-wrap:wrap;color:rgba(255,255,255,.58);font-size:13px}.progress-foot span{border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:7px 10px;background:rgba(255,255,255,.025)}@media(max-width:720px){.training-center-premium{margin:-16px -12px 0;padding:calc(30px + env(safe-area-inset-top)) 22px calc(118px + env(safe-area-inset-bottom))}.premium-hero{min-height:312px;align-items:start;padding-top:28px}.premium-hero:after{right:-66px;top:26px;width:245px;height:245px}.premium-hero:before{right:1px;top:100px;font-size:102px}.premium-hero h1{font-size:52px;max-width:355px}.premium-hero p:not(.premium-eyebrow){font-size:17px;max-width:350px}.path-grid{gap:14px}.path-card{grid-template-columns:88px minmax(0,1fr) 48px;gap:14px;padding:22px 18px;min-height:150px}.path-icon{width:76px;height:76px;border-radius:18px;font-size:34px}.path-card h2{font-size:22px}.path-card p{font-size:16px}.path-metric{grid-column:1/-1;margin-top:14px}.mini-track{gap:6px}.mini-track i{width:25px}.stats-grid{grid-template-columns:repeat(4,1fr)}.stat-item{padding:0 8px}.stat-value{font-size:28px}.stat-label{font-size:12px}.progress-card{padding:22px 14px}.progress-head{align-items:flex-start}}@media(max-width:430px){.training-center-premium{padding-left:21px;padding-right:21px}.path-card{grid-template-columns:76px minmax(0,1fr) 44px;gap:12px;padding:20px 14px;border-radius:23px}.path-icon{width:66px;height:66px;border-radius:16px;font-size:29px}.path-card h2{font-size:20px;letter-spacing:.01em}.path-card p{font-size:15px;line-height:1.38}.new-pill{font-size:11px;padding:4px 9px}.path-arrow{width:43px;height:43px;font-size:34px}.path-metric{padding:10px 12px;font-size:14px}.path-metric strong{font-size:19px}.mini-track i{width:18px;height:6px}.progress-card{border-radius:22px}.progress-head{margin-bottom:18px}.report-button{padding:8px 10px;font-size:11px}.stat-icon{font-size:23px}.stat-value{font-size:24px}.stat-label{font-size:11px}.progress-foot{font-size:12px}}@media(max-width:360px){.path-card{grid-template-columns:1fr 42px}.path-icon{display:none}.path-metric{grid-column:1/-1}.premium-hero h1{font-size:46px}.stats-grid{grid-template-columns:repeat(2,1fr);gap:16px}.stat-item:nth-child(2){border-right:0}.stat-item{border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:12px}.stat-item:nth-child(n+3){border-bottom:0;padding-top:4px}}`;

export default function TrainingCenterPage() {
  return (
    <AppShell>
      <main className="training-center-premium">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="training-center-inner">
          <section className="premium-hero">
            <div>
              <p className="premium-eyebrow">Central de Treinamento ✦</p>
              <h1>Treine sua voz todos os <span>dias.</span></h1>
              <p>Escolha um desafio diário ou monte seu treino personalizado por objetivo no modo personalizado.</p>
            </div>
          </section>

          <p className="premium-section-title">Escolha seu caminho</p>
          <section className="path-grid" aria-label="Caminhos de treinamento">
            <Link className="path-card daily" href="/aluno/central/diarios" prefetch>
              <div className="path-icon">▣</div>
              <div className="path-content">
                <div className="path-title-row"><h2>Diários</h2><span className="new-pill">Novo</span></div>
                <p>Desafios sequenciais diários para criar hábito e evolução constante.</p>
                <TrainingCenterDailyMetric />
              </div>
              <div className="path-arrow">›</div>
            </Link>

            <Link className="path-card custom" href="/aluno/central/personalizado" prefetch>
              <div className="path-icon">≋</div>
              <div className="path-content">
                <div className="path-title-row"><h2>Personalizado</h2></div>
                <p>Escolha o objetivo, o exercício e personalize seu treino.</p>
                <div className="path-metric"><span>◎</span><span>Foco no que você precisa</span></div>
              </div>
              <div className="path-arrow">›</div>
            </Link>

            <Link className="path-card repertoire" href="/aluno/central/repertorio" prefetch>
              <div className="path-icon">♫</div>
              <div className="path-content">
                <div className="path-title-row"><h2>Estude seu Repertório</h2></div>
                <p>Use exercícios, pitches e dicas de forma inteligente nas suas músicas.</p>
                <div className="path-metric"><span>★</span><span>Transforme técnica em performance</span></div>
              </div>
              <div className="path-arrow">›</div>
            </Link>
          </section>

          <TrainingCenterProgressCard />
        </div>
      </main>
    </AppShell>
  );
}
