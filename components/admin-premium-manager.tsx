'use client';

import { useMemo, useState } from 'react';
import { COURSE_ACCESS } from '@/lib/access/products';

type PremiumRow = {
  key: string;
  student: { id?: string; name?: string | null; email?: string | null; whatsapp?: string | null };
  state: { label: string; tone: string; active: boolean; remove: boolean; action: string };
  renewalTone: string;
  renewalDate?: string | null;
  renewalDateLabel: string;
  renewalLabel: string;
  accessReason: string;
  amount: number;
  method: string;
  productName: string;
  courseKey?: string;
  courseLabel?: string;
  lastEventLabel: string;
  lastEventTone: string;
  lastEventDate: string;
  whatsapp?: string | null;
  estimated: boolean;
  updatedAt?: string | null;
};

type Props = { rows: PremiumRow[]; removeEmails: string; lateEmails: string };

const css = `.premium-revenue-console{display:grid;gap:18px}.premium-revenue-toolbar{border:1px solid rgba(255,255,255,.12);border-radius:26px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.024));padding:18px;box-shadow:0 22px 70px rgba(0,0,0,.22)}.premium-revenue-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:16px}.premium-revenue-head h2{font-size:34px;margin:4px 0}.premium-revenue-head p{margin:0;color:rgba(248,247,251,.62)}.premium-revenue-filters{display:grid;grid-template-columns:minmax(240px,1fr) repeat(4,minmax(140px,185px));gap:12px}.premium-revenue-input,.premium-revenue-select{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.055);color:#fff;padding:15px 16px;font-weight:850;outline:none}.premium-revenue-select option{color:#111}.premium-metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.premium-metric-card{border:1px solid rgba(245,199,107,.25);border-radius:22px;background:radial-gradient(circle at 80% 0,rgba(245,199,107,.18),transparent 38%),rgba(255,255,255,.035);padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.24)}.premium-metric-card span{display:block;color:#f5c76b;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:950;margin-bottom:10px}.premium-metric-card strong{display:block;font-size:clamp(28px,3.4vw,44px);letter-spacing:-.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.premium-metric-card p{margin:6px 0 0;color:rgba(248,247,251,.64)}.premium-chart-panel{border:1px solid rgba(255,255,255,.12);border-radius:26px;background:rgba(255,255,255,.035);padding:18px;overflow:hidden}.mini-chart{height:160px;display:flex;align-items:end;gap:7px;padding:16px 0 4px;border-top:1px solid rgba(255,255,255,.08);margin-top:12px}.mini-chart i{flex:1;min-width:8px;border-radius:8px 8px 0 0;background:linear-gradient(180deg,#ffd86b,#926813);box-shadow:0 0 22px rgba(245,199,107,.18)}.premium-subscription-list{border:1px solid rgba(255,255,255,.12);border-radius:26px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.018));overflow:hidden}.premium-subscription-header,.premium-subscription-row{display:grid;grid-template-columns:1.4fr .9fr .8fr .9fr .9fr 110px;gap:14px;align-items:center;padding:15px 18px}.premium-subscription-header{color:#f5c76b;text-transform:uppercase;font-size:11px;letter-spacing:.16em;font-weight:950;background:rgba(0,0,0,.18)}.premium-subscription-row{border-top:1px solid rgba(255,255,255,.08)}.premium-subscription-row:hover{background:rgba(245,199,107,.055)}.premium-subscription-row h3{margin:0 0 4px;font-size:16px}.premium-subscription-row p,.premium-subscription-row small{margin:0;color:rgba(248,247,251,.62)}.premium-course-pill,.premium-state-pill{display:inline-flex;width:max-content;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:950}.premium-course-pill{border:1px solid rgba(245,199,107,.3);color:#f5c76b;background:rgba(245,199,107,.1)}.premium-state-pill.active{color:#73f58b;background:rgba(53,205,93,.14);border:1px solid rgba(53,205,93,.25)}.premium-state-pill.late,.premium-state-pill.pending{color:#f5c76b;background:rgba(245,199,107,.12);border:1px solid rgba(245,199,107,.25)}.premium-state-pill.danger{color:#ff9a9a;background:rgba(255,91,91,.12);border:1px solid rgba(255,91,91,.25)}.premium-list-actions{display:flex;gap:8px;justify-content:flex-end}.premium-round-action{width:38px;height:38px;border-radius:13px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:#fff;display:grid;place-items:center;text-decoration:none}.premium-round-action.whatsapp{color:#85ff9d;background:rgba(27,197,89,.15);border-color:rgba(27,197,89,.35)}.premium-group-tools{display:grid;grid-template-columns:1fr 1fr;gap:14px}.premium-group-tools article{border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:18px;background:rgba(255,255,255,.03)}.premium-group-tools textarea{width:100%;min-height:100px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.2);color:#fff;padding:12px;margin-top:10px}@media(max-width:1100px){.premium-metric-grid{grid-template-columns:repeat(2,1fr)}.premium-revenue-filters{grid-template-columns:1fr 1fr}.premium-subscription-header{display:none}.premium-subscription-row{grid-template-columns:1fr;gap:10px}.premium-list-actions{justify-content:flex-start}}@media(max-width:620px){.premium-revenue-head{display:block}.premium-revenue-filters,.premium-metric-grid,.premium-group-tools{grid-template-columns:1fr}.premium-revenue-toolbar,.premium-chart-panel,.premium-subscription-list{border-radius:20px}.premium-subscription-row{padding:16px}.mini-chart{height:120px;overflow-x:auto}.mini-chart i{flex:0 0 12px}}`;

const statusFilters = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativos', label: 'Ativos' },
  { key: 'vencendo', label: 'Vencendo' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'bloquear', label: 'Bloquear' },
];
const periods = [
  { key: 'dia', label: 'Hoje' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês atual' },
  { key: 'ano', label: 'Ano atual' },
  { key: 'todos', label: 'Todo período' },
];

function money(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0); }
function compactMoney(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: value >= 10000 ? 1 : 2 }).format(value || 0); }
function rowGroup(row: PremiumRow) {
  if (row.state.remove) return 'bloquear';
  if (row.state.tone === 'late') return 'atrasados';
  if (row.state.tone === 'pending') return 'pendentes';
  if (row.renewalTone === 'late' || row.renewalTone === 'pending') return 'vencendo';
  if (row.state.active) return 'ativos';
  return 'todos';
}
function startOfPeriod(period: string) {
  const date = new Date();
  if (period === 'todos') return null;
  date.setHours(0, 0, 0, 0);
  if (period === 'dia') return date;
  if (period === 'semana') { const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return date; }
  if (period === 'mes') { date.setDate(1); return date; }
  if (period === 'ano') { date.setMonth(0, 1); return date; }
  return null;
}
function dateInPeriod(value: string | null | undefined, period: string) {
  if (period === 'todos') return true;
  const start = startOfPeriod(period);
  const date = value ? new Date(value) : null;
  if (!start || !date || Number.isNaN(date.getTime())) return false;
  return date >= start;
}
function chartBuckets(rows: PremiumRow[], period: string) {
  const count = period === 'dia' ? 12 : period === 'semana' ? 7 : period === 'mes' ? 30 : 12;
  const buckets = Array.from({ length: count }, () => 0);
  rows.forEach((row, index) => { buckets[index % count] += row.amount; });
  return buckets;
}

export function AdminPremiumManager({ rows, removeEmails, lateEmails }: Props) {
  const [statusFilter, setStatusFilter] = useState('todos');
  const [courseFilter, setCourseFilter] = useState('todos');
  const [period, setPeriod] = useState('mes');
  const [metricView, setMetricView] = useState('principal');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'todos' || rowGroup(row) === statusFilter || (statusFilter === 'ativos' && row.state.active);
      const matchesCourse = courseFilter === 'todos' || row.courseKey === courseFilter;
      const matchesPeriod = dateInPeriod(row.updatedAt || row.renewalDate, period);
      const text = `${row.student.name || ''} ${row.student.email || ''} ${row.student.whatsapp || ''} ${row.productName || ''} ${row.courseLabel || ''}`.toLowerCase();
      return matchesStatus && matchesCourse && matchesPeriod && (!term || text.includes(term));
    });
  }, [rows, statusFilter, courseFilter, period, query]);

  const activeRows = visible.filter((row) => row.state.active);
  const paidRows = visible.filter((row) => row.state.active && row.amount > 0);
  const revenue = paidRows.reduce((sum, row) => sum + row.amount, 0);
  const renewals = visible.filter((row) => row.renewalTone === 'late' || row.renewalTone === 'pending');
  const cancellations = visible.filter((row) => row.state.remove);
  const avgTicket = paidRows.length ? revenue / paidRows.length : 0;
  const annual = revenue * 12;
  const buckets = chartBuckets(paidRows, period);
  const maxBucket = Math.max(1, ...buckets);

  return (
    <section className="premium-revenue-console">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="premium-revenue-toolbar">
        <div className="premium-revenue-head"><div><span className="eyebrow">Controle financeiro</span><h2>Receita e acessos</h2><p>Filtre por período, curso, status e aluno. Tudo troca na tela sem recarregar.</p></div></div>
        <div className="premium-revenue-filters">
          <input className="premium-revenue-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aluno, e-mail, WhatsApp ou produto..." />
          <select className="premium-revenue-select" value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select>
          <select className="premium-revenue-select" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="todos">Todos os cursos</option>{COURSE_ACCESS.map((course) => <option value={course.key} key={course.key}>{course.label}</option>)}</select>
          <select className="premium-revenue-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{statusFilters.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select>
          <select className="premium-revenue-select" value={metricView} onChange={(event) => setMetricView(event.target.value)}><option value="principal">Métricas principais</option><option value="media">Ver ticket médio</option><option value="anual">Ver estimativa anual</option></select>
        </div>
      </div>

      <div className="premium-metric-grid">
        <article className="premium-metric-card"><span>Receita real</span><strong>{compactMoney(revenue)}</strong><p>{paidRows.length} pagamento(s) no filtro</p></article>
        <article className="premium-metric-card"><span>Novos acessos</span><strong>{activeRows.length}</strong><p>alunos com acesso ativo</p></article>
        <article className="premium-metric-card"><span>Renovações</span><strong>{renewals.length}</strong><p>renovando ou exigindo atenção</p></article>
        <article className="premium-metric-card"><span>{metricView === 'anual' ? 'Estimativa anual' : metricView === 'media' ? 'Ticket médio' : 'Cancelamentos'}</span><strong>{metricView === 'anual' ? compactMoney(annual) : metricView === 'media' ? money(avgTicket) : cancellations.length}</strong><p>{metricView === 'principal' ? 'acessos para revisar' : 'baseado no filtro atual'}</p></article>
      </div>

      <section className="premium-chart-panel"><div className="section-heading compact"><div><p className="eyebrow">Movimento</p><h2>Receita do período</h2></div><span className="pill">{visible.length} registros</span></div><div className="mini-chart">{buckets.map((value, index) => <i key={index} style={{ height: `${Math.max(8, (value / maxBucket) * 100)}%` }} title={money(value)} />)}</div></section>

      <div className="premium-group-tools">
        <article><p className="eyebrow">Grupo WhatsApp</p><h3>Lista para remover</h3><p>{removeEmails ? 'Contatos sem acesso ativo.' : 'Nenhum aluno para remover agora.'}</p><textarea readOnly value={removeEmails} placeholder="E-mails para remover aparecem aqui" /></article>
        <article><p className="eyebrow">Cobrança</p><h3>Assinaturas atrasadas</h3><p>{lateEmails ? 'Alunos para cobrar renovação.' : 'Nenhuma assinatura atrasada.'}</p><textarea readOnly value={lateEmails} placeholder="E-mails atrasados aparecem aqui" /></article>
      </div>

      <div className="premium-subscription-list">
        <div className="premium-subscription-header"><span>Aluno</span><span>Curso</span><span>Status</span><span>Renovação</span><span>Valor</span><span>Ações</span></div>
        {visible.map((row) => <article className="premium-subscription-row" key={row.key}><div><h3>{row.student.name || 'Sem nome'}</h3><p>{row.student.email}</p><small>{row.student.whatsapp || 'WhatsApp não informado'}</small></div><span className="premium-course-pill">{row.courseLabel || 'Produto'}</span><span className={`premium-state-pill ${row.state.tone}`}>{row.state.label}</span><div><strong>{row.renewalDateLabel}</strong><p>{row.renewalLabel}</p></div><div><strong>{money(row.amount)}</strong><p>{row.method}</p></div><div className="premium-list-actions">{row.whatsapp ? <a className="premium-round-action whatsapp" href={row.whatsapp} target="_blank" rel="noreferrer">↗</a> : null}<span className="premium-round-action">⋯</span></div></article>)}
        {!visible.length ? <p className="muted" style={{ padding: 18 }}>Nenhuma assinatura neste filtro.</p> : null}
      </div>
    </section>
  );
}
