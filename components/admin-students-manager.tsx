'use client';

import { useMemo, useState } from 'react';
import { COURSE_ACCESS, accessStatusGroup, courseKeyFromProduct, courseShortLabelFromKey, isAccessActive } from '@/lib/access/products';

type Subscription = { status?: string | null; product_name?: string | null; current_period_end?: string | null; current_period_start?: string | null; updated_at?: string | null };
type Student = { id: string; name?: string | null; email?: string | null; whatsapp?: string | null; avatar_url?: string | null; created_at?: string | null; subscriptions?: Subscription[] };
type Props = { students: Student[] };

function onlyDigits(value?: string | null) { return String(value || '').split('').filter((char) => char >= '0' && char <= '9').join(''); }
function whatsappLink(value?: string | null, name?: string | null) { const digits = onlyDigits(value); if (!digits) return ''; const withCountry = digits.startsWith('55') ? digits : `55${digits}`; return `https://wa.me/${withCountry}?text=${encodeURIComponent(`Oi ${name || ''}, tudo bem? Estou conferindo seu acesso na Escola Foco em Canto.`)}`; }
function dateLabel(value?: string | null) { if (!value) return 'Sem data'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Sem data' : new Intl.DateTimeFormat('pt-BR').format(date); }
function latestSubscription(student: Student) { return [...(student.subscriptions || [])].sort((a, b) => new Date(b.updated_at || b.current_period_start || 0).getTime() - new Date(a.updated_at || a.current_period_start || 0).getTime())[0] || null; }
function hasCourse(student: Student, key: string) { return (student.subscriptions || []).some((sub) => courseKeyFromProduct(sub.product_name) === key && isAccessActive(sub.status)); }
function studentStatusGroup(student: Student) { const subs = student.subscriptions || []; if (!subs.length) return 'sem_acesso'; if (subs.some((sub) => isAccessActive(sub.status))) return 'ativos'; if (subs.some((sub) => accessStatusGroup(sub.status) === 'atrasados')) return 'atrasados'; if (subs.some((sub) => accessStatusGroup(sub.status) === 'pendentes')) return 'pendentes'; return 'inativos'; }

const statusFilters = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativos', label: 'Ativos' },
  { key: 'inativos', label: 'Inativos' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'sem_acesso', label: 'Sem acesso' },
];

export function AdminStudentsManager({ students }: Props) {
  const [filter, setFilter] = useState('todos');
  const [courseFilter, setCourseFilter] = useState('todos');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => students.find((student) => student.id === selectedId) || null, [students, selectedId]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { todos: students.length, ativos: 0, inativos: 0, atrasados: 0, pendentes: 0, sem_acesso: 0 };
    students.forEach((student) => { const group = studentStatusGroup(student); base[group] = (base[group] || 0) + 1; });
    return base;
  }, [students]);

  const courseCounts = useMemo(() => {
    const base: Record<string, number> = { todos: students.length };
    COURSE_ACCESS.forEach((course) => { base[course.key] = students.filter((student) => hasCourse(student, course.key)).length; });
    return base;
  }, [students]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return students.filter((student) => {
      const group = studentStatusGroup(student);
      const matchesStatus = filter === 'todos' || group === filter;
      const matchesCourse = courseFilter === 'todos' || hasCourse(student, courseFilter);
      const subsText = (student.subscriptions || []).map((sub) => `${sub.product_name || ''} ${sub.status || ''}`).join(' ');
      const text = `${student.name || ''} ${student.email || ''} ${student.whatsapp || ''} ${subsText}`.toLowerCase();
      return matchesStatus && matchesCourse && (!term || text.includes(term));
    });
  }, [students, filter, courseFilter, query]);

  return (
    <section className="admin-clean-section">
      <div className="admin-clean-heading student-list-heading">
        <div><span className="admin-clean-eyebrow">Jornada dos alunos</span><h2>{visible.length} aluno{visible.length === 1 ? '' : 's'}</h2><p className="admin-clean-muted">Veja quais cursos cada aluno possui, origem do acesso e próximos vencimentos.</p></div>
        <input className="student-live-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, e-mail, WhatsApp ou curso..." />
      </div>
      <div className="student-filter-pills" role="tablist" aria-label="Filtrar status dos alunos">
        {statusFilters.map((item) => <button className={filter === item.key ? 'active' : ''} key={item.key} onClick={() => setFilter(item.key)} type="button">{item.label}<span>{counts[item.key] || 0}</span></button>)}
      </div>
      <div className="student-filter-pills course-filter-pills" role="tablist" aria-label="Filtrar cursos dos alunos">
        <button className={courseFilter === 'todos' ? 'active' : ''} onClick={() => setCourseFilter('todos')} type="button">Todos cursos<span>{courseCounts.todos || 0}</span></button>
        {COURSE_ACCESS.slice(0, 4).map((course) => <button className={courseFilter === course.key ? 'active' : ''} key={course.key} onClick={() => setCourseFilter(course.key)} type="button">{course.shortLabel}<span>{courseCounts[course.key] || 0}</span></button>)}
      </div>
      <div className="admin-students-list">
        {visible.map((student) => {
          const subscription = latestSubscription(student);
          const wa = whatsappLink(student.whatsapp, student.name);
          const active = studentStatusGroup(student) === 'ativos';
          const activeCourses = COURSE_ACCESS.filter((course) => hasCourse(student, course.key));
          return (
            <article className="admin-student-row admin-student-manage-row" key={student.id}>
              <button className="admin-student-avatar" type="button" onClick={() => setSelectedId(student.id)}>{student.avatar_url ? <img src={student.avatar_url} alt="" /> : <span>{String(student.name || student.email || 'A').slice(0, 1).toUpperCase()}</span>}</button>
              <button className="student-click-area" type="button" onClick={() => setSelectedId(student.id)}><h3>{student.name || 'Aluno sem nome'}</h3><p>{student.email || 'Sem e-mail'}{student.whatsapp ? ` · ${student.whatsapp}` : ''}</p><small>{activeCourses.length ? activeCourses.map((course) => course.shortLabel).join(' · ') : subscription?.product_name || 'Sem curso liberado'}</small></button>
              <div className="student-manage-actions"><span className={active ? 'student-status active' : 'student-status'}>{active ? 'com acesso' : studentStatusGroup(student).replace('_', ' ')}</span>{wa ? <a className="admin-clean-button whatsapp" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : null}<button className="admin-clean-button secondary" type="button" onClick={() => setSelectedId(student.id)}>Detalhes</button><form action="/admin/alunos/remover" method="post"><input type="hidden" name="id" value={student.id} /><button className="admin-clean-button danger" type="submit">Excluir</button></form></div>
            </article>
          );
        })}
        {!visible.length ? <p className="admin-clean-muted">Nenhum aluno neste filtro.</p> : null}
      </div>

      {selected ? (
        <div className="student-detail-overlay" role="dialog" aria-modal="true">
          <div className="student-detail-panel">
            <div className="student-detail-head"><div><span className="admin-clean-eyebrow">Jornada do aluno</span><h2>{selected.name || 'Aluno sem nome'}</h2><p>{selected.email || 'Sem e-mail'}{selected.whatsapp ? ` · ${selected.whatsapp}` : ''}</p></div><button className="admin-clean-button secondary" onClick={() => setSelectedId(null)} type="button">Fechar</button></div>
            <div className="student-access-grid">{COURSE_ACCESS.slice(0, 5).map((course) => { const sub = (selected.subscriptions || []).find((item) => courseKeyFromProduct(item.product_name) === course.key); const active = isAccessActive(sub?.status); return <article className={active ? 'student-access-card active' : 'student-access-card locked'} key={course.key}><span>{course.label}</span><strong>{active ? 'Liberado' : 'Bloqueado'}</strong><p>{sub?.product_name || 'Sem compra registrada'}</p><small>{sub?.current_period_end ? `vence em ${dateLabel(sub.current_period_end)}` : sub?.status || 'sem assinatura'}</small></article>; })}</div>
            <section className="student-timeline"><h3>Histórico de compras e acessos</h3>{(selected.subscriptions || []).length ? (selected.subscriptions || []).map((sub, index) => <article key={`${sub.product_name}-${index}`}><span>{courseShortLabelFromKey(courseKeyFromProduct(sub.product_name))}</span><div><strong>{sub.product_name || 'Produto sem nome'}</strong><p>Status: {sub.status || 'sem status'} · início: {dateLabel(sub.current_period_start || sub.updated_at)} · fim: {dateLabel(sub.current_period_end)}</p></div></article>) : <p className="admin-clean-muted">Nenhuma assinatura registrada para este aluno.</p>}</section>
            <div className="student-detail-actions">{whatsappLink(selected.whatsapp, selected.name) ? <a className="admin-clean-button whatsapp" href={whatsappLink(selected.whatsapp, selected.name)} target="_blank" rel="noreferrer">Chamar no WhatsApp</a> : null}<a className="admin-clean-button primary" href={`/admin/premium?student=${encodeURIComponent(selected.email || '')}`}>Ver assinaturas</a></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
