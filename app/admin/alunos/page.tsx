import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Search = { q?: string; novo?: string; saved?: string; deleted?: string };
type Row = any;

function onlyDigits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function whatsappLink(value?: string | null) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

async function addStudent(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const whatsapp = String(formData.get('whatsapp') || '').trim();
  const productName = String(formData.get('product_name') || '').trim();
  const status = String(formData.get('status') || 'active');
  if (!email && !whatsapp) return;

  const id = crypto.randomUUID();
  const { data: existing } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null } as any;
  const profileId = existing?.id || id;

  if (existing?.id) {
    await supabase.from('profiles').update({ name, whatsapp, role: 'student', updated_at: new Date().toISOString() }).eq('id', profileId);
  } else {
    await supabase.from('profiles').insert({ id: profileId, name, email: email || null, whatsapp, role: 'student' });
  }

  if (productName) {
    await supabase.from('subscriptions').insert({ profile_id: profileId, status, product_name: productName });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/alunos');
}

async function deleteStudent(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { data: submissions } = await supabase.from('submissions').select('id').eq('profile_id', id);
  const submissionIds = (submissions || []).map((item: any) => item.id);
  if (submissionIds.length) await supabase.from('reviews').delete().in('submission_id', submissionIds);
  await supabase.from('submissions').delete().eq('profile_id', id);
  await supabase.from('subscriptions').delete().eq('profile_id', id);
  await supabase.from('profiles').delete().eq('id', id);
  revalidatePath('/admin');
  revalidatePath('/admin/alunos');
}

export default async function AdminStudentsPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const query = searchParams ? await searchParams : {};
  const q = String(query.q || '').trim();
  const supabase = createAdminClient();
  let builder = supabase.from('profiles').select('id,name,email,whatsapp,avatar_url,role,created_at,subscriptions(status,current_period_end,product_name)').order('created_at', { ascending: false }).limit(120);
  if (q) builder = builder.or(`name.ilike.%${q}%,email.ilike.%${q}%,whatsapp.ilike.%${q}%`);
  const [{ data: students }, { data: products }] = await Promise.all([
    builder,
    supabase.from('products').select('name').order('created_at', { ascending: false }),
  ]);

  const list = (students || []) as Row[];

  return (
    <main className="admin-page-clean admin-students-page">
      <section className="admin-clean-hero">
        <div><span className="admin-clean-eyebrow">Alunos</span><h1>Alunos e acessos</h1><p>Busque, cadastre, fale no WhatsApp e remova alunos do Hub.</p></div>
        <div className="admin-clean-actions"><a className="admin-clean-button secondary" href="/admin">Voltar</a><a className="admin-clean-button primary" href="#novo-aluno">Novo aluno</a></div>
      </section>

      <section className="admin-clean-section student-tools-panel">
        <form className="student-search-form" action="/admin/alunos">
          <label>Buscar aluno<input name="q" defaultValue={q} placeholder="Nome, e-mail ou WhatsApp" /></label>
          <button className="admin-clean-button primary" type="submit">Buscar</button>
          {q ? <a className="admin-clean-button secondary" href="/admin/alunos">Limpar</a> : null}
        </form>
        <details id="novo-aluno" className="student-add-details" open={Boolean(query.novo)}>
          <summary>+ Cadastrar aluno</summary>
          <form className="admin-clean-form" action={addStudent}>
            <div className="admin-clean-form-row"><label>Nome<input name="name" placeholder="Nome do aluno" /></label><label>E-mail<input name="email" type="email" placeholder="email@exemplo.com" /></label></div>
            <div className="admin-clean-form-row"><label>WhatsApp<input name="whatsapp" placeholder="(71) 99999-9999" /></label><label>Status<select name="status" defaultValue="active"><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="pending">Pendente</option></select></label></div>
            <label>Produto vinculado<select name="product_name" defaultValue=""><option value="">Sem produto agora</option>{(products || []).map((product: any) => <option value={product.name} key={product.name}>{product.name}</option>)}</select></label>
            <button className="admin-clean-button primary" type="submit">Salvar aluno</button>
          </form>
        </details>
      </section>

      <section className="admin-clean-section">
        <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Lista</span><h2>{list.length} aluno{list.length === 1 ? '' : 's'}</h2></div></div>
        <div className="admin-students-list">
          {list.map((student) => {
            const subscription = Array.isArray(student.subscriptions) ? student.subscriptions[0] : student.subscriptions;
            const wa = whatsappLink(student.whatsapp);
            const active = ['active', 'paid', 'trialing', 'approved'].includes(String(subscription?.status || '').toLowerCase());
            return (
              <article className="admin-student-row admin-student-manage-row" key={student.id}>
                <div className="admin-student-avatar">{student.avatar_url ? <img src={student.avatar_url} alt="" /> : <span>{String(student.name || student.email || 'A').slice(0, 1).toUpperCase()}</span>}</div>
                <div><h3>{student.name || 'Aluno sem nome'}</h3><p>{student.email || 'Sem e-mail'}{student.whatsapp ? ` · ${student.whatsapp}` : ''}</p><small>{subscription?.product_name || 'Produto não informado'}</small></div>
                <div className="student-manage-actions"><span className={active ? 'student-status active' : 'student-status'}>{subscription?.status || 'sem assinatura'}</span>{wa ? <a className="admin-clean-button whatsapp" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : null}<form action={deleteStudent}><input type="hidden" name="id" value={student.id} /><button className="admin-clean-button danger" type="submit">Excluir</button></form></div>
              </article>
            );
          })}
          {!list.length ? <p className="admin-clean-muted">Nenhum aluno encontrado.</p> : null}
        </div>
      </section>
    </main>
  );
}
