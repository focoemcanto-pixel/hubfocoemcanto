'use client';

import { useMemo, useState } from 'react';
import { COURSE_ACCESS, accessStatusGroup, courseKeyFromProduct, courseShortLabelFromKey, isAccessActive } from '@/lib/access/products';

type Subscription = { status?: string | null; course_key?: string | null; product_name?: string | null; current_period_end?: string | null; current_period_start?: string | null; updated_at?: string | null };
type Student = { id: string; name?: string | null; email?: string | null; whatsapp?: string | null; avatar_url?: string | null; created_at?: string | null; subscriptions?: Subscription[] };
type Props = { students: Student[] };

const css = `.student-premium-console{display:grid;gap:18px}.student-premium-toolbar{border:1px solid rgba(255,255,255,.12);border-radius:26px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.025));padding:18px;box-shadow:0 22px 70px rgba(0,0,0,.22)}.student-premium-head{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:16px}.student-premium-head h2{font-size:34px;margin:4px 0}.student-premium-head p{margin:0;color:rgba(248,247,251,.62)}.student-premium-filters{display:grid;grid-template-columns:minmax(260px,1fr) repeat(3,minmax(150px,190px));gap:12px;align-items:end}.student-premium-search,.student-premium-select{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.055);color:#fff;padding:15px 16px;font-weight:800;outline:none}.student-premium-select option{color:#111}.student-premium-table{border:1px solid rgba(255,255,255,.12);border-radius:26px;overflow:hidden;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.02));box-shadow:0 24px 80px rgba(0,0,0,.24)}.student-table-header,.student-table-row{display:grid;grid-template-columns:1.6fr 1.15fr .78fr .9fr .9fr 150px;gap:14px;align-items:center;padding:15px 18px}.student-table-header{color:#f5c76b;text-transform:uppercase;font-size:11px;letter-spacing:.16em;font-weight:950;background:rgba(0,0,0,.18)}.student-table-row{border-top:1px solid rgba(255,255,255,.08);transition:.18s}.student-table-row:hover{background:rgba(245,199,107,.055)}.student-person{display:flex;align-items:center;gap:13px;text-align:left;background:transparent;border:0;color:#fff;cursor:pointer}.student-avatar-premium{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;border:1px solid rgba(245,199,107,.35);background:rgba(245,199,107,.12);color:#f5c76b;font-weight:950;overflow:hidden}.student-avatar-premium img{width:100%;height:100%;object-fit:cover}.student-person h3{margin:0 0 4px;font-size:16px}.student-person p{margin:0;color:rgba(248,247,251,.6);font-size:13px}.course-chip-row{display:flex;gap:6px;flex-wrap:wrap}.course-chip{border:1px solid rgba(245,199,107,.28);background:rgba(245,199,107,.1);color:#f5c76b;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:950}.course-chip.empty{color:#aaa;border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.05)}.status-dot{display:inline-flex;gap:7px;align-items:center;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:950}.status-dot:before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}.status-dot.ativos{color:#73f58b;background:rgba(53,205,93,.14);border:1px solid rgba(53,205,93,.26)}.status-dot.inativos,.status-dot.sem_acesso{color:#ff8d8d;background:rgba(255,91,91,.12);border:1px solid rgba(255,91,91,.22)}.status-dot.pendentes,.status-dot.atrasados{color:#f5c76b;background:rgba(245,199,107,.12);border:1px solid rgba(245,199,107,.25)}.progress-mini{display:grid;gap:6px}.progress-mini strong{font-size:13px}.progress-track{height:6px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}.progress-track span{display:block;height:100%;background:linear-gradient(90deg,#f7d46b,#e1aa3b)}.student-actions-compact{display:flex;gap:8px;justify-content:flex-end}.student-icon-btn{width:38px;height:38px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:rgba(255,255,255,.055);color:#fff;display:grid;place-items:center;text-decoration:none;font-weight:950}.student-icon-btn.whatsapp{background:rgba(27,197,89,.15);border-color:rgba(27,197,89,.35);color:#85ff9d}.student-icon-btn.danger{color:#ff9a9a;border-color:rgba(255,91,91,.28);background:rgba(255,91,91,.1)}.student-table-footer{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-top:1px solid rgba(255,255,255,.08);color:rgba(248,247,251,.65)}.student-detail-overlay{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.68);backdrop-filter:blur(12px);display:grid;place-items:center;padding:20px}.student-detail-panel{width:min(960px,100%);max-height:88vh;overflow:auto;border:1px solid rgba(245,199,107,.2);border-radius:30px;background:linear-gradient(145deg,#17161d,#0b0b10);box-shadow:0 40px 140px #000;padding:24px}.student-detail-head{display:flex;justify-content:space-between;gap:18px;align-items:start}.student-access-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:18px 0}.student-access-card{border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:15px;background:rgba(255,255,255,.04)}.student-access-card.active{border-color:rgba(53,205,93,.35);background:rgba(53,205,93,.08)}.student-access-card.locked{opacity:.72}.student-access-card span{color:#f5c76b;text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:950}.student-access-card strong{display:block;margin-top:8px}.student-access-card p,.student-access-card small{color:rgba(248,247,251,.62)}.student-timeline article{display:flex;gap:14px;border-top:1px solid rgba(255,255,255,.08);padding:12px 0}.student-timeline article>span{color:#f5c76b;font-weight:950;min-width:90px}.student-detail-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}@media(max-width:980px){.student-premium-filters{grid-template-columns:1fr 1fr}.student-table-header{display:none}.student-table-row{grid-template-columns:1fr;gap:10px}.student-actions-compact{justify-content:flex-start}.student-access-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.student-premium-head{display:block}.student-premium-filters{grid-template-columns:1fr}.student-premium-table{border-radius:20px}.student-table-row{padding:16px}.student-detail-panel{padding:18px;border-radius:22px}.student-access-grid{grid-template-columns:1fr}.student-table-footer{display:block}}`;

function onlyDigits(value?: string | null) { return String(value || '').split('').filter((char) => char >= '0' && char <= '9').join(''); }
function whatsappLink(value?: string | null, name?: string | null) { const digits = onlyDigits(value); if (!digits) return ''; const withCountry = digits.startsWith('55') ? digits : `55${digits}`; return `https://wa.me/${withCountry}?text=${encodeURIComponent(`Oi ${name || ''}, tudo bem? Estou conferindo seu acesso na Escola Foco em Canto.`)}`; }
function dateLabel(value?: string | null) { if (!value) return 'Sem data'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Sem data' : new Intl.DateTimeFormat('pt-BR').format(date); }
function latestSubscription(student: Student) { return [...(student.subscriptions || [])].sort((a, b) => new Date(b.updated_at || b.current_period_start || 0).getTime() - new Date(a.updated_at || a.current_period_start || 0).getTime())[0] || null; }
function subCourseKey(sub?: Subscription | null) { return sub?.course_key || courseKeyFromProduct(sub?.product_name); }
function hasCourse(student: Student, key: string) { return (student.subscriptions || []).some((sub) => subCourseKey(sub) === key && isAccessActive(sub.status)); }
function studentStatusGroup(student: Student) { const subs = student.subscriptions || []; if (!subs.length) return 'sem_acesso'; if (subs.some((sub) => isAccessActive(sub.status))) return 'ativos'; if (subs.some((sub) => accessStatusGroup(sub.status) === 'atrasados')) return 'atrasados'; if (subs.some((sub) => accessStatusGroup(sub.status) === 'pendentes')) return 'pendentes'; return 'inativos'; }
function progressFor(student: Student) { const active = (student.subscriptions || []).filter((sub) => isAccessActive(sub.status)).length; return Math.min(100, active * 34); }

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
  const [accessFilter, setAccessFilter] = useState('todos');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => students.find((student) => student.id === selectedId) || null, [students, selectedId]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return students.filter((student) => {
      const group = studentStatusGroup(student);
      const activeCourses = COURSE_ACCESS.filter((course) => hasCourse(student, course.key));
      const matchesStatus = filter === 'todos' || group === filter;
      const matchesCourse = courseFilter === 'todos' || hasCourse(student, courseFilter);
      const matchesAccess = accessFilter === 'todos' || (accessFilter === 'com_acesso' ? activeCourses.length > 0 : activeCourses.length === 0);
      const subsText = (student.subscriptions || []).map((sub) => `${sub.product_name || ''} ${sub.course_key || ''} ${sub.status || ''}`).join(' ');
      const text = `${student.name || ''} ${student.email || ''} ${student.whatsapp || ''} ${subsText}`.toLowerCase();
      return matchesStatus && matchesCourse && matchesAccess && (!term || text.includes(term));
    });
  }, [students, filter, courseFilter, accessFilter, query]);

  return (
    <section className="student-premium-console">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="student-premium-toolbar">
        <div className="student-premium-head"><div><span className="admin-clean-eyebrow">Jornada dos alunos</span><h2>{visible.length} alunos</h2><p>Lista organizada por curso, status, acesso e busca rápida.</p></div></div>
        <div className="student-premium-filters">
          <input className="student-premium-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, e-mail, WhatsApp ou curso..." />
          <select className="student-premium-select" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="todos">Todos os cursos</option>{COURSE_ACCESS.map((course) => <option value={course.key} key={course.key}>{course.label}</option>)}</select>
          <select className="student-premium-select" value={filter} onChange={(event) => setFilter(event.target.value)}>{statusFilters.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select>
          <select className="student-premium-select" value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}><option value="todos">Todos os acessos</option><option value="com_acesso">Com acesso</option><option value="sem_acesso">Sem acesso</option></select>
        </div>
      </div>

      <div className="student-premium-table">
        <div className="student-table-header"><span>Aluno</span><span>Cursos</span><span>Status</span><span>Último acesso</span><span>Progresso</span><span>Ações</span></div>
        {visible.map((student) => {
          const subscription = latestSubscription(student);
          const wa = whatsappLink(student.whatsapp, student.name);
          const group = studentStatusGroup(student);
          const activeCourses = COURSE_ACCESS.filter((course) => hasCourse(student, course.key));
          const progress = progressFor(student);
          return (
            <article className="student-table-row" key={student.id}>
              <button className="student-person" type="button" onClick={() => setSelectedId(student.id)}><span className="student-avatar-premium">{student.avatar_url ? <img src={student.avatar_url} alt="" /> : String(student.name || student.email || 'A').slice(0, 1).toUpperCase()}</span><span><h3>{student.name || 'Aluno sem nome'}</h3><p>{student.email || 'Sem e-mail'}{student.whatsapp ? ` · ${student.whatsapp}` : ''}</p></span></button>
              <div className="course-chip-row">{activeCourses.length ? activeCourses.map((course) => <span className="course-chip" key={course.key}>{course.shortLabel}</span>) : <span className="course-chip empty">Sem curso</span>}</div>
              <span className={`status-dot ${group}`}>{group.replace('_', ' ')}</span>
              <span>{dateLabel(subscription?.updated_at || student.created_at)}</span>
              <div className="progress-mini"><strong>{progress}%</strong><div className="progress-track"><span style={{ width: `${Math.max(6, progress)}%` }} /></div></div>
              <div className="student-actions-compact"><button className="student-icon-btn" onClick={() => setSelectedId(student.id)} type="button" title="Detalhes">👁</button>{wa ? <a className="student-icon-btn whatsapp" href={wa} target="_blank" rel="noreferrer" title="WhatsApp">↗</a> : null}<form action="/admin/alunos/remover" method="post"><input type="hidden" name="id" value={student.id} /><button className="student-icon-btn danger" type="submit" title="Excluir">×</button></form></div>
            </article>
          );
        })}
        {!visible.length ? <p className="admin-clean-muted" style={{ padding: 18 }}>Nenhum aluno neste filtro.</p> : null}
        <div className="student-table-footer"><span>{visible.length} de {students.length} alunos exibidos</span><span>Filtros aplicados sem recarregar a página</span></div>
      </div>

      {selected ? (
        <div className="student-detail-overlay" role="dialog" aria-modal="true">
          <div className="student-detail-panel">
            <div className="student-detail-head"><div><span className="admin-clean-eyebrow">Jornada do aluno</span><h2>{selected.name || 'Aluno sem nome'}</h2><p>{selected.email || 'Sem e-mail'}{selected.whatsapp ? ` · ${selected.whatsapp}` : ''}</p></div><button className="admin-clean-button secondary" onClick={() => setSelectedId(null)} type="button">Fechar</button></div>
            <div className="student-access-grid">{COURSE_ACCESS.slice(0, 5).map((course) => { const sub = (selected.subscriptions || []).find((item) => subCourseKey(item) === course.key); const active = isAccessActive(sub?.status); return <article className={active ? 'student-access-card active' : 'student-access-card locked'} key={course.key}><span>{course.label}</span><strong>{active ? 'Liberado' : 'Bloqueado'}</strong><p>{sub?.product_name || 'Sem compra registrada'}</p><small>{sub?.current_period_end ? `vence em ${dateLabel(sub.current_period_end)}` : sub?.status || 'sem assinatura'}</small></article>; })}</div>
            <section className="student-timeline"><h3>Histórico de compras e acessos</h3>{(selected.subscriptions || []).length ? (selected.subscriptions || []).map((sub, index) => <article key={`${sub.product_name}-${index}`}><span>{courseShortLabelFromKey(subCourseKey(sub))}</span><div><strong>{sub.product_name || 'Produto sem nome'}</strong><p>Status: {sub.status || 'sem status'} · início: {dateLabel(sub.current_period_start || sub.updated_at)} · fim: {dateLabel(sub.current_period_end)}</p></div></article>) : <p className="admin-clean-muted">Nenhuma assinatura registrada para este aluno.</p>}</section>
            <div className="student-detail-actions">{whatsappLink(selected.whatsapp, selected.name) ? <a className="admin-clean-button whatsapp" href={whatsappLink(selected.whatsapp, selected.name)} target="_blank" rel="noreferrer">Chamar no WhatsApp</a> : null}<a className="admin-clean-button primary" href={`/admin/premium?student=${encodeURIComponent(selected.email || '')}`}>Ver assinaturas</a></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
