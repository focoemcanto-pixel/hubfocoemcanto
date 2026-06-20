import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminStudentsPage() {
  const supabase = createAdminClient();
  const { data: students } = await supabase
    .from('profiles')
    .select('id,name,email,whatsapp,role,subscriptions(status,current_period_end,product_name)')
    .order('created_at', { ascending: false })
    .limit(80);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Alunos</p>
          <h1>Assinantes e acessos</h1>
          <p className="muted">Veja quem tem acesso liberado, vencido ou inativo.</p>
        </div>
        <a className="button secondary" href="/admin">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/conteudos">Conteudos</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/avaliacoes">Avaliacoes</a>
      </nav>

      <section className="card admin-section">
        <h2>Lista de alunos</h2>
        <div className="admin-list">
          {(students || []).map((student: any) => {
            const subscription = Array.isArray(student.subscriptions) ? student.subscriptions[0] : student.subscriptions;
            return (
              <div className="admin-row" key={student.id}>
                <div>
                  <span className="pill">{subscription?.status || 'sem assinatura'}</span>
                  <h3>{student.name || 'Sem nome'}</h3>
                  <p className="muted">{student.email}</p>
                  <p className="muted">{subscription?.product_name || 'Produto nao informado'}</p>
                </div>
                <small>{subscription?.current_period_end || 'sem vencimento'}</small>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
