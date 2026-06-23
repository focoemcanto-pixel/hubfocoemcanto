'use client';

import { useMemo, useState } from 'react';

type PremiumRow = {
  key: string;
  student: { id?: string; name?: string | null; email?: string | null; whatsapp?: string | null };
  state: { label: string; tone: string; active: boolean; remove: boolean; action: string };
  renewalTone: string;
  renewalDateLabel: string;
  renewalLabel: string;
  accessReason: string;
  amountLabel: string;
  method: string;
  productName: string;
  lastEventLabel: string;
  lastEventTone: string;
  lastEventDate: string;
  whatsapp?: string | null;
  estimated: boolean;
};

type Props = {
  rows: PremiumRow[];
  removeEmails: string;
  lateEmails: string;
};

const filters = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativos', label: 'Ativos' },
  { key: 'vencendo', label: 'Vencendo' },
  { key: 'revisar', label: 'Datas estimadas' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'remover', label: 'Remover' },
];

function rowGroup(row: PremiumRow) {
  if (row.state.remove) return 'remover';
  if (row.state.tone === 'late') return 'atrasados';
  if (row.state.tone === 'pending') return 'pendentes';
  if (row.estimated) return 'revisar';
  if (row.renewalTone === 'late' || row.renewalTone === 'pending') return 'vencendo';
  if (row.state.active) return 'ativos';
  return 'todos';
}

export function AdminPremiumManager({ rows, removeEmails, lateEmails }: Props) {
  const [filter, setFilter] = useState('todos');

  const counts = useMemo(() => {
    const base: Record<string, number> = { todos: rows.length, ativos: 0, vencendo: 0, revisar: 0, atrasados: 0, pendentes: 0, remover: 0 };
    rows.forEach((row) => {
      if (row.state.active) base.ativos += 1;
      if (row.renewalTone === 'late' || row.renewalTone === 'pending') base.vencendo += 1;
      if (row.estimated) base.revisar += 1;
      if (row.state.tone === 'late') base.atrasados += 1;
      if (row.state.tone === 'pending') base.pendentes += 1;
      if (row.state.remove) base.remover += 1;
    });
    return base;
  }, [rows]);

  const visible = useMemo(() => rows.filter((row) => filter === 'todos' || rowGroup(row) === filter || (filter === 'ativos' && row.state.active)), [rows, filter]);

  return (
    <>
      <section className="premium-filter-bar premium-filter-bar-console no-refresh-filter">
        {filters.map((item) => <button className={filter === item.key ? 'active' : ''} key={item.key} onClick={() => setFilter(item.key)} type="button">{item.label}<span>{counts[item.key] || 0}</span></button>)}
      </section>

      <section className="premium-group-tools premium-tools-console">
        <article><p className="eyebrow">Grupo WhatsApp</p><h3>Lista para remover</h3><p>{removeEmails ? 'Contatos sem acesso ativo.' : 'Nenhum aluno para remover agora.'}</p><textarea readOnly value={removeEmails} placeholder="E-mails para remover aparecem aqui" /></article>
        <article><p className="eyebrow">Cobrança</p><h3>Assinaturas atrasadas</h3><p>{lateEmails ? 'Alunos para cobrar renovação.' : 'Nenhuma assinatura atrasada.'}</p><textarea readOnly value={lateEmails} placeholder="E-mails atrasados aparecem aqui" /></article>
      </section>

      <article className="premium-panel premium-subscriber-panel">
        <div className="section-heading"><div><p className="eyebrow">Gestão de acesso</p><h2>Lista premium</h2></div><span className="pill">{visible.length} contatos</span></div>
        <div className="premium-subscriber-list">
          {visible.map((row) => (
            <article className={`premium-subscriber-card ${row.state.tone} renewal-${row.renewalTone}`} key={row.key}>
              <div className="premium-member-main"><span className={`premium-status ${row.state.tone}`}>{row.state.label}</span><h3>{row.student.name || 'Sem nome'}</h3><p>{row.student.email}</p><small>{row.student.whatsapp || 'WhatsApp não informado'}</small></div>
              <div className="premium-renewal-box"><span>{row.state.active ? 'Próxima renovação' : 'Venceu em'}</span><strong>{row.renewalDateLabel}</strong><em>{row.state.active ? row.renewalLabel : row.accessReason}</em></div>
              <div className="premium-plan-box"><span>Financeiro</span><strong>{row.amountLabel} / mês</strong><small>{row.method} · {row.productName}</small></div>
              <div className="premium-event-box"><span>Último webhook</span><strong className={`event-${row.lastEventTone}`}>{row.lastEventLabel}</strong><small>{row.lastEventDate}</small></div>
              <div className="premium-actions premium-actions-console"><span className={row.state.remove ? 'remove-tag' : row.state.tone === 'late' ? 'late-tag' : row.estimated ? 'late-tag' : 'keep-tag'}>{row.state.remove ? 'remover do grupo' : row.estimated ? 'data estimada' : row.state.action}</span>{row.whatsapp ? <a className="button secondary" href={row.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a> : null}</div>
            </article>
          ))}
          {!visible.length ? <p className="muted">Nenhuma assinatura neste filtro.</p> : null}
        </div>
      </article>
    </>
  );
}
