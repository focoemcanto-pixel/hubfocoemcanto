import { createAdminClient } from '@/lib/supabase/admin';
import { AdminStudentsManager } from '@/components/admin-students-manager';

export const dynamic = 'force-dynamic';

type Search = { novo?: string; saved?: string; removed?: string; error?: string };
type Row = any;

export default async function AdminStudentsPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const query = searchParams ? await searchParams : {};
  const supabase = createAdminClient();
  const [{ data: students }, { data: products }] = await Promise.all([
    supabase.from('profiles').select('id,name,email,whatsapp,avatar_url,role,created_at,subscriptions(status,current_period_start,current_period_end,product_name,provider,updated_at)').order('created_at', { ascending: false }).limit(800),
    supabase.from('products').select('name').order('created_at', { ascending: false }),
  ]);

  const list = ((students || []) as Row[]).map((student) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    whatsapp: student.whatsapp,
    avatar_url: student.avatar_url,
    created_at: student.created_at,
    subscriptions: Array.isArray(student.subscriptions) ? student.subscriptions : student.subscriptions ? [student.subscriptions] : [],
  }));

  return (
    <main className="admin-page-clean admin-students-page">
      <section className="admin-clean-hero">
        <div><span className="admin-clean-eyebrow">Alunos</span><h1>Alunos e acessos</h1><p>Busque, filtre, cadastre, fale no WhatsApp e acompanhe a jornada completa por curso.</p></div>
        <div className="admin-clean-actions"><a className="admin-clean-button secondary" href="/admin">Voltar</a><a className="admin-clean-button primary" href="#novo-aluno">Novo aluno</a></div>
      </section>

      <section className="admin-clean-section student-tools-panel">
        {query.saved ? <p className="admin-save-success">Aluno salvo com sucesso.</p> : null}
        {query.removed ? <p className="admin-save-success">Aluno removido.</p> : null}
        {query.error ? <p className="admin-save-error">Não foi possível concluir a ação.</p> : null}
        <details id="novo-aluno" className="student-add-details" open={Boolean(query.novo)}>
          <summary>+ Cadastrar aluno</summary>
          <form className="admin-clean-form" action="/admin/alunos/criar" method="post">
            <div className="admin-clean-form-row"><label>Nome<input name="name" placeholder="Nome do aluno" /></label><label>E-mail<input name="email" type="email" placeholder="email@exemplo.com" /></label></div>
            <div className="admin-clean-form-row"><label>WhatsApp<input name="whatsapp" placeholder="(71) 99999-9999" /></label><label>Status<select name="status" defaultValue="active"><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="pending">Pendente</option><option value="late">Atrasado</option></select></label></div>
            <label>Produto vinculado<select name="product_name" defaultValue=""><option value="">Sem produto agora</option>{(products || []).map((product: any) => <option value={product.name} key={product.name}>{product.name}</option>)}</select></label>
            <button className="admin-clean-button primary" type="submit">Salvar aluno</button>
          </form>
        </details>
      </section>

      <AdminStudentsManager students={list} />
    </main>
  );
}
