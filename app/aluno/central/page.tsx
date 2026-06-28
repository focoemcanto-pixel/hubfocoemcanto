import Link from 'next/link';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

const css = `.training-center-premium{min-height:100dvh;margin:-24px -16px 0;padding:calc(38px + env(safe-area-inset-top)) 24px calc(112px + env(safe-area-inset-bottom));color:#fff;background:radial-gradient(circle at 82% 15%,rgba(245,199,107,.16),transparent 24%),radial-gradient(circle at 22% 70%,rgba(38,224,196,.08),transparent 26%),linear-gradient(180deg,#151515 0%,#07080a 58%,#030304 100%);overflow:hidden}.training-center-inner{max-width:760px;margin:0 auto}.premium-hero{position:relative;min-height:330px;display:grid;align-items:center;padding:22px 0 28px}.premium-hero:after{content:'';position:absolute;right:-22px;top:12px;width:270px;height:270px;border-radius:50%;border:1px solid rgba(245,199,107,.26);background:radial-gradient(circle at 62% 42%,rgba(245,199,107,.22),transparent 32%),linear-gradient(135deg,rgba(255,255,255,.04),transparent);box-shadow:0 0 90px rgba(245,199,107,.14);opacity:.95}.premium-hero:before{content:'🎙';position:absolute;right:38px;top:80px;z-index:1;font-size:118px;filter:sepia(1) saturate(1.8) hue-rotate(350deg) drop-shadow(0 0 34px rgba(245,199,107,.35));opacity:.78}.premium-eyebrow{font-size:13px;letter-spacing:.26em;text-transform:uppercase;color:#f5c76b;font-weight:950;margin:0 0 28px;text-shadow:0 0 24px rgba(245,199,107,.22)}.premium-hero h1{position:relative;z-index:2;font-family:Georgia,'Times New Roman',serif;font-size:clamp(50px,10vw,72px);line-height:.93;letter-spacing:-.06em;margin:0 0 22px;max-width:490px;text-shadow:0 16px 60px rgba(0,0,0,.55)}.premium-hero h1 span{color:#f5c76b}.premium-hero p:not(.premium-eyebrow){position:relative;z-index:2;max-width:470px;color:rgba(255,255,255,.72);font-size:18px;line-height:1.55;margin:0}.premium-section-title{margin:26px 0 14px;color:#f5c76b;text-transform:uppercase;letter-spacing:.24em;font-weight:950;font-size:13px}.path-grid{display:grid;gap:16px}.path-card{position:relative;overflow:hidden;display:grid;grid-template-columns:122px 1fr 58px;gap:22px;align-items:center;min-height:156px;padding:26px 26px;border-radius:24px;text-decoration:none;color:#fff;border:1px solid rgba(245,199,107,.22);background:radial-gradient(circle at 80% 20%,rgba(245,199,107,.08),transparent 38%),linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018));box-shadow:0 26px 80px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.04)}.path-card:before{content:'';position:absolute;inset:0;background:linear-gradient(110deg,rgba(255,255,255,.08),transparent 38%,rgba(255,255,255,.02));opacity:.6;pointer-events:none}.path-card.custom{border-color:rgba(38,224,196,.22);background:radial-gradient(circle at 80% 20%,rgba(38,224,196,.12),transparent 38%),linear-gradient(135deg,rgba(20,55,53,.42),rgba(255,255,255,.018))}.path-card.repertoire{border-color:rgba(168,105,255,.24);background:radial-gradient(circle at 80% 20%,rgba(168,105,255,.13),transparent 38%),linear-gradient(135deg,rgba(48,31,77,.40),rgba(255,255,255,.018))}.path-icon{position:relative;z-index:1;width:96px;height:96px;border-radius:20px;display:grid;place-items:center;border:1px solid rgba(245,199,107,.26);background:linear-gradient(145deg,rgba(245,199,107,.1),rgba(255,255,255,.025));font-size:44px;color:#f5c76b;box-shadow:inset 0 0 30px rgba(245,199,107,.06)}.path-card.custom .path-icon{border-color:rgba(38,224,196,.34);color:#45e6cc;background:linear-gradient(145deg,rgba(38,224,196,.12),rgba(255,255,255,.025))}.path-card.repertoire .path-icon{border-color:rgba(168,105,255,.34);color:#a96dff;background:linear-gradient(145deg,rgba(168,105,255,.14),rgba(255,255,255,.025))}.path-content{position:relative;z-index:1}.path-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.path-card h2{font-size:26px;text-transform:uppercase;letter-spacing:.02em;margin:0;font-weight:950}.new-pill{border:1px solid rgba(245,199,107,.35);background:rgba(245,199,107,.14);color:#f5c76b;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:950}.path-card p{margin:12px 0 0;color:rgba(255,255,255,.68);font-size:18px;line-height:1.45}.path-metric{margin-top:22px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.035);padding:12px 14px;display:flex;align-items:center;gap:12px;color:rgba(255,255,255,.70);font-size:15px}.path-metric strong{color:#f5c76b;font-size:20px;margin-right:4px}.mini-track{margin-left:auto;display:flex;align-items:center;gap:7px}.mini-track i{display:block;width:35px;height:7px;border-radius:999px;background:rgba(245,199,107,.95);box-shadow:0 0 14px rgba(245,199,107,.34)}.mini-track i:last-child{background:rgba(255,255,255,.12);box-shadow:none}.path-arrow{position:relative;z-index:1;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor;color:#f5c76b;font-size:44px;line-height:1;box-shadow:0 0 28px rgba(245,199,107,.09)}.path-card.custom .path-arrow{color:#45e6cc}.path-card.repertoire .path-arrow{color:#a96dff}.progress-card{margin-top:22px;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.025));padding:24px 26px;box-shadow:0 22px 70px rgba(0,0,0,.25)}.progress-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}.progress-head h2{margin:0;text-transform:uppercase;letter-spacing:.08em;font-size:16px;color:#f5c76b}.report-button{border:1px solid rgba(245,199,107,.34);border-radius:999px;color:#f5c76b;text-decoration:none;padding:10px 14px;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.05em}.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0}.stat-item{text-align:center;padding:0 12px;border-right:1px solid rgba(255,255,255,.10)}.stat-item:last-child{border-right:0}.stat-icon{font-size:28px;margin-bottom:10px}.stat-value{display:block;font-size:36px;font-weight:950;line-height:1}.stat-value.green{color:#67d84f}.stat-value.orange{color:#ff8c32}.stat-value.blue{color:#4db8ff}.stat-value.gold{color:#f5c76b}.stat-label{display:block;margin-top:6px;color:rgba(255,255,255,.67);font-size:14px;line-height:1.25}.premium-bottom-nav{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:50;max-width:780px;margin:0 auto;border:1px solid rgba(255,255,255,.12);border-radius:32px;background:linear-gradient(180deg,rgba(25,25,28,.92),rgba(8,8,10,.94));backdrop-filter:blur(22px);box-shadow:0 -20px 60px rgba(0,0,0,.42);display:grid;grid-template-columns:repeat(5,1fr);overflow:hidden}.premium-nav-item{position:relative;display:grid;justify-items:center;gap:5px;padding:14px 6px 16px;color:rgba(255,255,255,.45);text-decoration:none;font-weight:850;font-size:13px}.premium-nav-item span:first-child{font-size:25px}.premium-nav-item.active{color:#f5c76b;text-shadow:0 0 20px rgba(245,199,107,.28)}.premium-nav-item.active:after{content:'';position:absolute;left:20%;right:20%;bottom:0;height:3px;background:#f5c76b;border-radius:999px;box-shadow:0 0 20px rgba(245,199,107,.8)}@media(max-width:720px){.training-center-premium{margin:-16px -12px 0;padding-left:24px;padding-right:24px}.premium-hero{min-height:345px}.premium-hero:after{right:-62px;top:30px;width:245px;height:245px}.premium-hero:before{right:5px;top:102px;font-size:104px}.premium-hero h1{font-size:52px;max-width:360px}.premium-hero p:not(.premium-eyebrow){font-size:17px;max-width:350px}.path-grid{gap:14px}.path-card{grid-template-columns:96px 1fr 48px;gap:14px;padding:24px 18px;min-height:150px}.path-icon{width:76px;height:76px;border-radius:18px;font-size:34px}.path-card h2{font-size:22px}.path-card p{font-size:16px}.path-metric{grid-column:1 / -1;margin-top:14px}.stats-grid{grid-template-columns:repeat(4,1fr)}.stat-item{padding:0 8px}.stat-value{font-size:30px}.stat-label{font-size:12px}.progress-card{padding:22px 14px}.premium-bottom-nav{left:8px;right:8px}.premium-nav-item{font-size:12px}}@media(max-width:390px){.path-card{grid-template-columns:82px 1fr 42px}.path-icon{width:70px;height:70px}.path-card h2{font-size:20px}.premium-hero h1{font-size:48px}.stat-value{font-size:26px}}`;

const stats = [
  { icon: '◎', value: '68', label: 'Exercícios\nconcluídos', color: 'green' },
  { icon: '🔥', value: '12', label: 'Dias\nseguidos', color: 'orange' },
  { icon: '〰', value: '87%', label: 'Precisão\nmédia', color: 'blue' },
  { icon: '🏆', value: '5', label: 'Conquistas\nalcançadas', color: 'gold' },
];

export default function TrainingCenterPage() {
  return (
    <AppShell hideNav>
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
                <div className="path-metric"><span>🔥</span><strong>12</strong><span>dias seguidos</span><div className="mini-track"><i /><i /><i /><i /><i /><i /></div></div>
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

          <section className="progress-card">
            <div className="progress-head"><h2>Seu progresso geral</h2><Link className="report-button" href="/aluno/central/diarios/progresso" prefetch>▥ Ver relatório</Link></div>
            <div className="stats-grid">
              {stats.map((stat) => <div className="stat-item" key={stat.label}><div className="stat-icon">{stat.icon}</div><strong className={`stat-value ${stat.color}`}>{stat.value}</strong><span className="stat-label">{stat.label.split('\n').map((line) => <span key={line}>{line}<br /></span>)}</span></div>)}
            </div>
          </section>
        </div>

        <nav className="premium-bottom-nav" aria-label="Navegação principal">
          <Link className="premium-nav-item" href="/aluno/afinador" prefetch><span>〰</span><span>Afinador</span></Link>
          <Link className="premium-nav-item" href="/aluno/central/personalizado#aquecimentos" prefetch><span>♥</span><span>Aquecimento</span></Link>
          <Link className="premium-nav-item" href="/aluno/cursos" prefetch><span>✦</span><span>Lições</span></Link>
          <Link className="premium-nav-item active" href="/aluno/central" prefetch><span>▣</span><span>Programa</span></Link>
          <Link className="premium-nav-item" href="/aluno/perfil" prefetch><span>◉</span><span>Perfil</span></Link>
        </nav>
      </main>
    </AppShell>
  );
}
