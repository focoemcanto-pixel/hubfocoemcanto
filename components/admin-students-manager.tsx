'use client';

import { useMemo, useState } from 'react';

type Student = {
  id: string;
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  avatar_url?: string | null;
  subscription?: { status?: string | null; product_name?: string | null; current_period_end?: string | null } | null;
};

type Props = { students: Student[] };

function onlyDigits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function whatsappLink(value?: string | null) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

function isActive(status?: string | null) {
  return ['active', 'paid', 'trialing', 'approved'].includes(String(status || '').toLowerCase());
}

function statusGroup(student: Student) {
  const status = String(student.subscription?.status || '').toLowerCase();
  if (isActive(status)) return 'ativos';
  if (status === 'pending') return 'pendentes';
  if (status === 'late' || status === 'overdue' || status === 'past_due') return 'atrasados';
  if (!status) return 'sem_assinatura';
  return 'inativos';
}

const filters = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativos', label: 'Ativos' },
  { key: 'inativos', label: 'Inativos' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'sem_assinatura', label: 'Sem assinatura' },
];

export function AdminStudentsManager({ students }: Props) {
  const [filter, setFilter] = useState('todos');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const base: Record<string, number> = { todos: students.length, ativos: 0, inativos: 0, atrasados: 0, pendentes: 0, sem_assinatura: 0 };
    students.forEach((student) => { base[statusGroup(student)] = (base[statusGroup(student)] || 0) + 1; });
    return base;
  }, [students]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return students.filter((student) => {
      const group = statusGroup(student);
      const matchesFilter = filter === 'todos' || group === filter;
      const text = `${student.name || ''} ${student.email || ''} ${student.whatsapp || ''} ${student.subscription?.product_name || ''}`.toLowerCase();
      return matchesFilter && (!term || text.includes(term));
    });
  }, [students, filter, query]);

  return (
    <section className="admin-clean-section">
      <div className="admin-clean-heading student-list-heading">
        <div><span className="admin-clean-eyebrow">Lista</span><h2>{visible.length} aluno{visible.length === 1 ? '' : 's'}</h2></div>
        <input className="student-live-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar sem recarregar..." />
      </div>
      <div className="student-filter-pills" role="tablist" aria-label="Filtrar alunos">
        {filters.map((item) => <button className={filter === item.key ? 'active' : ''} key={item.key} onClick={() => setFilter(item.key)} type="button">{item.label}<span>{counts[item.key] || 0}</span></button>)}
      </div>
      <div className="admin-students-list">
        {visible.map((student) => {
          const subscription = student.subscription;
          const wa = whatsappLink(student.whatsapp);
          const active = isActive(subscription?.status);
          return (
            <article className="admin-student-row admin-student-manage-row" key={student.id}>
              <div className="admin-student-avatar">{student.avatar_url ? <img src={student.avatar_url} alt="" /> : <span>{String(student.name || student.email || 'A').slice(0, 1).toUpperCase()}</span>}</div>
              <div><h3>{student.name || 'Aluno sem nome'}</h3><p>{student.email || 'Sem e-mail'}{student.whatsapp ? ` · ${student.whatsapp}` : ''}</p><small>{subscription?.product_name || 'Produto não informado'}</small></div>
              <div className="student-manage-actions"><span className={active ? 'student-status active' : 'student-status'}>{subscription?.status || 'sem assinatura'}</span>{wa ? <a className="admin-clean-button whatsapp" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : null}<form action="/admin/alunos/excluir" method="post"><input type="hidden" name="id" value={student.id} /><button className="admin-clean-button danger" type="submit">Excluir</button></form></div>
            </article>
          );
        })}
        {!visible.length ? <p className="admin-clean-muted">Nenhum aluno neste filtro.</p> : null}
      </div>
    </section>
  );
}
