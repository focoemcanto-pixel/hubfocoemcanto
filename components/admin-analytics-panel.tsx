'use client';

type Metrics = {
  periodLabel: string;
  signupsFree: number;
  activeUsers: number;
  feedOpen?: number;
  communityOpen?: number;
  libraryOpen?: number;
  premiumBlocks: number;
  checkoutOpen: number;
  purchases: number;
  renewals: number;
  cancels: number;
  upgradeRate: number;
  checkoutRate: number;
  purchaseRate: number;
  blockedToCheckoutRate: number;
  revenueToday?: number;
  revenueMonth?: number;
  mrr?: number;
  activeSubscribers?: number;
  newSubscriptions?: number;
  avgTicket?: number;
  churnRate?: number;
  dau?: number;
  wau?: number;
  mau?: number;
  funnel: Array<{ key: string; label: string; value: number; rate?: number }>;
  topBlocked: Array<{ label: string; value: number }>;
  products?: Array<{ label: string; active: number; revenue: number; conversion: number }>;
  recent?: Array<{ label: string; detail: string; tone: string }>;
};

const css = `.analytics-admin-panel{display:grid;gap:18px;margin:18px 0}.exec-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.exec-card,.funnel-card,.opportunity-card,.products-card,.activity-card{border:1px solid rgba(245,199,107,.22);border-radius:26px;background:radial-gradient(circle at 82% 0,rgba(245,199,107,.16),transparent 34%),rgba(255,255,255,.035);padding:18px;box-shadow:0 18px 70px rgba(0,0,0,.22)}.exec-card span{display:block;color:#f5c76b;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:950;margin-bottom:9px}.exec-card strong{display:block;font-size:clamp(28px,3vw,42px);letter-spacing:-.045em;line-height:1}.exec-card p{margin:7px 0 0;color:rgba(255,255,255,.62)}.analytics-two{display:grid;grid-template-columns:1.25fr .75fr;gap:14px}.analytics-three{display:grid;grid-template-columns:1fr 1fr;gap:14px}.funnel-card h2,.opportunity-card h2,.products-card h2,.activity-card h2{margin:4px 0 14px}.funnel-row{display:grid;grid-template-columns:155px 1fr 70px 58px;gap:12px;align-items:center;margin:11px 0}.funnel-row label{font-weight:950}.bar{height:15px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden}.bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffe39b,#e9b348)}.funnel-row b,.funnel-row small{text-align:right;color:#f5c76b;font-weight:950}.top-row,.product-row,.activity-row{display:grid;gap:8px;border:1px solid rgba(255,255,255,.1);border-radius:17px;padding:13px;background:rgba(0,0,0,.18);margin:9px 0}.top-row,.product-row{grid-template-columns:1fr auto;align-items:center}.top-row b,.product-row b{color:#f5c76b}.product-row small,.activity-row small{color:rgba(255,255,255,.62)}.activity-row{grid-template-columns:10px 1fr}.activity-dot{width:10px;height:10px;border-radius:999px;background:#f5c76b;margin-top:6px}.activity-row.active .activity-dot{background:#72f58b}.activity-row.danger .activity-dot{background:#ff7a7a}.health-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.health-pill{border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px;background:rgba(0,0,0,.18)}.health-pill span{display:block;color:rgba(255,255,255,.58);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.health-pill strong{font-size:28px}@media(max-width:1050px){.exec-grid{grid-template-columns:repeat(2,1fr)}.analytics-two,.analytics-three{grid-template-columns:1fr}}@media(max-width:620px){.exec-grid,.health-strip{grid-template-columns:1fr}.funnel-row{grid-template-columns:1fr}.funnel-row b,.funnel-row small{text-align:left}}`;
function brl(value?: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: (value || 0) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: (value || 0) >= 10000 ? 1 : 2 }).format(value || 0); }
function pct(value?: number) { return `${Math.round((value || 0) * 10) / 10}%`; }

export function AdminAnalyticsPanel({ metrics }: { metrics: Metrics }) {
  const max = Math.max(1, ...metrics.funnel.map((item) => item.value));
  const products = metrics.products || [];
  const recent = metrics.recent || [];
  return <section className="analytics-admin-panel"><style dangerouslySetInnerHTML={{ __html: css }} />
    <div className="exec-grid">
      <article className="exec-card"><span>Receita hoje</span><strong>{brl(metrics.revenueToday)}</strong><p>{metrics.newSubscriptions || metrics.purchases} nova(s) assinatura(s)</p></article>
      <article className="exec-card"><span>Receita mês</span><strong>{brl(metrics.revenueMonth)}</strong><p>{metrics.renewals} renovação(ões)</p></article>
      <article className="exec-card"><span>MRR</span><strong>{brl(metrics.mrr)}</strong><p>{metrics.activeSubscribers || metrics.activeUsers} assinantes/usuários ativos</p></article>
      <article className="exec-card"><span>Conversão Free→VIP</span><strong>{pct(metrics.upgradeRate)}</strong><p>{metrics.purchases} upgrade(s)</p></article>
      <article className="exec-card"><span>Cancelamentos</span><strong>{metrics.cancels}</strong><p>Churn estimado: {pct(metrics.churnRate)}</p></article>
      <article className="exec-card"><span>Ticket médio</span><strong>{brl(metrics.avgTicket)}</strong><p>baseado na base ativa</p></article>
      <article className="exec-card"><span>Bloqueios VIP</span><strong>{metrics.premiumBlocks}</strong><p>{pct(metrics.blockedToCheckoutRate)} abriram checkout</p></article>
      <article className="exec-card"><span>Checkout aberto</span><strong>{metrics.checkoutOpen}</strong><p>{pct(metrics.purchaseRate)} checkout → compra</p></article>
    </div>
    <section className="health-strip"><div className="health-pill"><span>DAU</span><strong>{metrics.dau || metrics.activeUsers}</strong></div><div className="health-pill"><span>WAU</span><strong>{metrics.wau || metrics.activeUsers}</strong></div><div className="health-pill"><span>MAU</span><strong>{metrics.mau || metrics.activeUsers}</strong></div></section>
    <div className="analytics-two"><article className="funnel-card"><p className="eyebrow">Funil {metrics.periodLabel}</p><h2>Jornada do aluno</h2>{metrics.funnel.map((step) => <div className="funnel-row" key={step.key}><label>{step.label}</label><div className="bar"><i style={{ width: `${Math.max(3, (step.value / max) * 100)}%` }} /></div><b>{step.value}</b><small>{step.rate !== undefined ? pct(step.rate) : ''}</small></div>)}</article><article className="opportunity-card"><p className="eyebrow">🔥 Oportunidades</p><h2>Onde mais vende VIP</h2>{metrics.topBlocked.length ? metrics.topBlocked.map((item) => <div className="top-row" key={item.label}><span>{item.label}</span><b>{item.value}</b></div>) : <p className="muted">Sem bloqueios registrados ainda.</p>}</article></div>
    <div className="analytics-three"><article className="products-card"><p className="eyebrow">Produtos</p><h2>Receita por produto</h2>{products.length ? products.map((item) => <div className="product-row" key={item.label}><div><strong>{item.label}</strong><small>{item.active} ativo(s) · conversão {pct(item.conversion)}</small></div><b>{brl(item.revenue)}</b></div>) : <p className="muted">Sem produtos no período.</p>}</article><article className="activity-card"><p className="eyebrow">Tempo real</p><h2>Atividade recente</h2>{recent.length ? recent.map((item, index) => <div className={`activity-row ${item.tone}`} key={`${item.label}-${index}`}><span className="activity-dot" /><div><strong>{item.label}</strong><small>{item.detail}</small></div></div>) : <p className="muted">Sem eventos recentes.</p>}</article></div>
  </section>;
}
