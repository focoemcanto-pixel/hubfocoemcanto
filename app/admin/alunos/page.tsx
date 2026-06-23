import { createAdminClient } from '@/lib/supabase/admin';
import { AdminStudentsManager } from '@/components/admin-students-manager';

export const dynamic = 'force-dynamic';

type Search = { novo?: string; saved?: string; removed?: string; error?: string };
type Row = Record<string, any>;
type StudentItem = {
  id: string;
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  subscriptions?: Row[];
};

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function pushAccess(map: Map<string, Row[]>, key: string | null | undefined, access: Row) {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return;
  map.set(normalized, [...(map.get(normalized) || []), access]);
}

function uniqueAccesses(accesses: Row[]) {
  const seen = new Set<string>();
  return accesses.filter((access) => {
    const key = access.id || `${access.product_name || ''}-${access.course_key || ''}-${access.status || ''}-${access.provider_customer_id || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchAllRows(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  select: string,
  orderColumn: string,
  ascending = false,
) {
  const pageSize = 1000;
  const rows: Row[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select(select).order(orderColumn, { ascending }).range(from, to);
    if (error) break;
    const chunk = (data || []) as Row[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

export default async function AdminStudentsPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const query = searchParams ? await searchParams : {};
  const supabase = createAdminClient();
  const [profiles, accessRows, { data: products }] = await Promise.all([
    fetchAllRows(supabase, 'profiles', 'id,name,email,whatsapp,avatar_url,role,created_at', 'created_at', false),
    fetchAllRows(supabase, 'subscriptions', 'id,profile_id,status,course_key,current_period_start,current_period_end,product_name,source_product_name,provider,provider_customer_id,updated_at', 'updated_at', false),
    supabase.from('products').select('name').order('created_at', { ascending: false }),
  ]);

  const accessByProfile = new Map<string, Row[]>();
  const accessByEmail = new Map<string, Row[]>();
  accessRows.forEach((access) => {
    pushAccess(accessByProfile, access.profile_id, access);
    pushAccess(accessByEmail, access.provider_customer_id, access);
  });

  const profileById = new Map<string, Row>();
  const profileByEmail = new Map<string, Row>();
  profiles.forEach((profile) => {
    if (profile.id) profileById.set(String(profile.id), profile);
    const email = normalizeEmail(profile.email);
    if (email) profileByEmail.set(email, profile);
  });

  const studentByKey = new Map<string, StudentItem>();
  profiles.forEach((student) => {
    const key = String(student.id || normalizeEmail(student.email));
    if (!key) return;
    const byId = accessByProfile.get(String(student.id).toLowerCase()) || [];
    const byEmail = accessByEmail.get(normalizeEmail(student.email)) || [];
    studentByKey.set(key, {
      id: String(student.id || normalizeEmail(student.email)),
      name: student.name,
      email: student.email,
      whatsapp: student.whatsapp,
      avatar_url: student.avatar_url,
      created_at: student.created_at,
      subscriptions: uniqueAccesses([...byId, ...byEmail]),
    });
  });

  accessRows.forEach((access) => {
    const profile = profileById.get(String(access.profile_id)) || profileByEmail.get(normalizeEmail(access.provider_customer_id));
    const key = String(profile?.id || access.profile_id || normalizeEmail(access.provider_customer_id));
    if (!key || studentByKey.has(key)) return;
    const byId = accessByProfile.get(String(access.profile_id || '').toLowerCase()) || [];
    const byEmail = accessByEmail.get(normalizeEmail(access.provider_customer_id)) || [];
    const email = profile?.email || access.provider_customer_id || null;
    studentByKey.set(key, {
      id: key,
      name: profile?.name || email?.split('@')[0] || 'Aluno sem nome',
      email,
      whatsapp: profile?.whatsapp || null,
      avatar_url: profile?.avatar_url || null,
      created_at: profile?.created_at || access.updated_at || null,
      subscriptions: uniqueAccesses([...byId, ...byEmail]),
    });
  });

  const list: StudentItem[] = Array.from(studentByKey.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return (
    <main className="admin-page-clean admin-students-page">
      <section className="admin-clean-hero compact-premium-hero">
        <div><span className="admin-clean-eyebrow">Alunos</span><h1>Jornada dos alunos</h1><p>Busque, filtre por curso/status/acesso e veja a trajetória completa de cada aluno.</p></div>
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
