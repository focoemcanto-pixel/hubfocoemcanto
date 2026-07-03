'use client';

type Metrics = {
  periodLabel: string;
  signupsFree: number;
  activeUsers: number;
  feedOpen: number;
  communityOpen: number;
  libraryOpen: number;
  premiumBlocks: number;
  checkoutOpen: number;
  purchases: number;
  renewals: number;
  cancels: number;
  upgradeRate: number;
  checkoutRate: number;
  purchaseRate: number;
  blockedToCheckoutRate: number;
  funnel: Array<{ key: string; label: string; value: number }>;
  topBlocked: Array<{ label: string; value: number }>;
};

const css = `.analytics-admin-panel{display:grid;gap:16px;margin:18px 0}.analytics-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.analytics-card,.analytics-funnel,.analytics-top{border:1px solid rgba(245,199,107,.22);border-radius:24px;background:radial-gradient(circle at 82% 0,rgba(245,199,107,.16),transparent 34%),rgba(255,255,255,.035);padding:18px}.analytics-card span{display:block;color:#f5c76b;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:950;margin-bottom:9px}.analytics-card strong{display:block;font-size:clamp(28px,3vw,42px);letter-spacing:-.04em}.analytics-card p{margin:6px 0 0;color:rgba(255,255,255,.62)}.analytics-panels{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}.analytics-funnel h2,.analytics-top h2{margin:4px 0 14px}.analytics-funnel-row{display:grid;grid-template-columns:150px 1fr 64px;gap:12px;align-items:center;margin:10px 0}.analytics-funnel-row label{font-weight:900}.analytics-bar{height:14px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden}.analytics-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffe39b,#e9b348)}.analytics-funnel-row b{text-align:right;color:#f5c76b}.analytics-top-row{display:flex;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:12px;background:rgba(0,0,0,.18);margin:8px 0}.analytics-top-row b{color:#f5c76b}@media(max-width:900px){.analytics-grid{grid-template-columns:repeat(2,1fr)}.analytics-panels{grid-template-columns:1fr}}@media(max-width:560px){.analytics-grid{grid-template-columns:1fr}.analytics-funnel-row{grid-template-columns:1fr}.analytics-funnel-row b{text-align:left}}`;
function pct(value: number) { return `${Math.round((value || 0) * 10) / 10}%`; }

export function AdminAnalyticsPanel({ metrics }: { metrics: Metrics }) {
  const max = Math.max(1, ...metrics.funnel.map((item) => item.value));
  return <section className="analytics-admin-panel"><style dangerouslySetInnerHTML={{ __html: css }} />
    <div className="analytics-grid">
      <article className="analytics-card"><span>Cadastros free</span><strong>{metrics.signupsFree}</strong><p>{metrics.activeUsers} usuários ativos no período</p></article>
      <article className="analytics-card"><span>Bloqueios VIP</span><strong>{metrics.premiumBlocks}</strong><p>{pct(metrics.blockedToCheckoutRate)} abriram checkout</p></article>
      <article className="analytics-card"><span>Checkout aberto</span><strong>{metrics.checkoutOpen}</strong><p>{pct(metrics.checkoutRate)} dos bloqueados</p></article>
      <article className="analytics-card"><span>Upgrades</span><strong>{metrics.purchases}</strong><p>{pct(metrics.purchaseRate)} checkout → compra</p></article>
    </div>
    <div className="analytics-panels">
      <article className="analytics-funnel"><p className="eyebrow">Funil {metrics.periodLabel}</p><h2>Jornada do aluno</h2>{metrics.funnel.map((step) => <div className="analytics-funnel-row" key={step.key}><label>{step.label}</label><div className="analytics-bar"><i style={{ width: `${Math.max(3, (step.value / max) * 100)}%` }} /></div><b>{step.value}</b></div>)}</article>
      <article className="analytics-top"><p className="eyebrow">Desejo de compra</p><h2>Áreas mais bloqueadas</h2>{metrics.topBlocked.length ? metrics.topBlocked.map((item) => <div className="analytics-top-row" key={item.label}><span>{item.label}</span><b>{item.value}</b></div>) : <p className="muted">Sem bloqueios registrados ainda.</p>}</article>
    </div>
  </section>;
}
