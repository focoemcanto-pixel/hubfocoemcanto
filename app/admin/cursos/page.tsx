import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Product = { id: string; name: string };
type Course = {
  id: string;
  product_id: string | null;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  cover_url: string | null;
  status: string;
  sort_order: number | null;
  products?: Product | Product[] | null;
};

function relatedProduct(value: unknown): Product | null {
  if (Array.isArray(value)) return (value[0] || null) as Product | null;
  return (value || null) as Product | null;
}

async function createCourse(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const title = String(formData.get('title') || '').trim();
  const slug = String(formData.get('slug') || '').trim();
  const subtitle = String(formData.get('subtitle') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const coverUrl = String(formData.get('cover_url') || '').trim();
  const productId = String(formData.get('product_id') || '').trim() || null;

  if (!title || !slug) return;

  await supabase.from('courses').insert({
    title,
    slug,
    subtitle,
    description,
    cover_url: coverUrl,
    product_id: productId,
    status: 'draft',
  });

  revalidatePath('/admin');
  revalidatePath('/admin/cursos');
}

export default async function AdminCoursesPage() {
  const supabase = createAdminClient();
  const [{ data: courses }, { data: products }] = await Promise.all([
    supabase
      .from('courses')
      .select('id,product_id,title,slug,subtitle,description,cover_url,status,sort_order,products(id,name)')
      .order('sort_order', { ascending: true }),
    supabase.from('products').select('id,name').order('created_at', { ascending: true }),
  ]);

  return (
    <main className="page admin-shell school-admin-shell">
      <section className="admin-hero school-hero compact-hero">
        <div>
          <p className="eyebrow">Área de membros</p>
          <h1>Cursos e salas</h1>
          <p className="muted">Crie experiências completas: Sala de Atividades VIP, Foco em Harmonia e os próximos produtos da escola.</p>
        </div>
        <a className="button secondary premium-button" href="/admin">Voltar ao resumo</a>
      </section>

      <nav className="admin-tabs school-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/produtos">Produtos</a>
        <a className="active" href="/admin/cursos">Cursos</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/premium">Assinaturas</a>
        <a href="/admin/avaliacoes">Avaliações</a>
      </nav>

      <section className="school-two-column">
        <div className="school-product-grid">
          {((courses || []) as Course[]).map((course) => {
            const product = relatedProduct(course.products);
            return (
              <article className="school-product-card course-card" key={course.id}>
                <div className="product-cover-frame course-cover-frame">
                  {course.cover_url ? <img src={course.cover_url} alt={course.title} /> : <div className="product-cover-placeholder">🎵</div>}
                  <span className={`product-status status-${course.status}`}>{course.status}</span>
                </div>
                <div className="product-card-body">
                  <p className="eyebrow">{product?.name || 'Sem produto vinculado'}</p>
                  <h2>{course.title}</h2>
                  <p className="muted">{course.subtitle || course.description || 'Adicione subtítulo, promessa e descrição para deixar a vitrine premium.'}</p>
                  <div className="product-meta-line">
                    <strong>{course.slug}</strong>
                    <span>Ordem {course.sort_order || 0}</span>
                  </div>
                  <div className="product-card-actions">
                    <a className="button premium-button" href={`/admin/cursos/${course.id}`}>Gerenciar</a>
                    <a className="button secondary premium-button" href={`/aluno/cursos/${course.slug}`}>Prévia</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="card premium-panel sticky-panel">
          <p className="eyebrow">Novo curso</p>
          <h2>Criar experiência</h2>
          <p className="muted">Use “curso” tanto para Foco em Harmonia quanto para Sala de Atividades VIP.</p>
          <form className="premium-form" action={createCourse}>
            <label><span>Produto que libera acesso</span><select name="product_id" defaultValue=""><option value="">Selecionar produto</option>{(products || []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label><span>Título</span><input name="title" placeholder="Ex: Foco em Harmonia" required /></label>
            <label><span>Slug</span><input name="slug" placeholder="foco-em-harmonia" required /></label>
            <label><span>Subtítulo</span><input name="subtitle" placeholder="Promessa curta do curso" /></label>
            <label><span>Descrição</span><textarea name="description" placeholder="Descreva a transformação do aluno." /></label>
            <label><span>URL da capa</span><input name="cover_url" placeholder="https://..." /></label>
            <button className="button premium-button submit-glow" type="submit">Criar curso</button>
          </form>
        </aside>
      </section>
    </main>
  );
}
