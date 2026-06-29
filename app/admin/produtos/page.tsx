import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ProductRow = { id: string; name: string; slug: string; description: string | null; type: string | null; status: string | null; cover_url: string | null; price_cents: number | null; billing_type: string | null; courses?: { id: string; slug: string | null; sort_order?: number | null }[] | null };

const defaultProducts = [
  { name: 'Grupo VIP', slug: 'grupo-vip', description: 'Sala de atividades, duetos, comunidade e análises do professor.', billing_type: 'recurring', type: 'subscription', status: 'published' },
  { name: 'Foco em Harmonia', slug: 'foco-em-harmonia', description: 'Curso completo para desenvolver percepção, divisão vocal e segunda voz.', billing_type: 'one_time', type: 'course', status: 'draft' },
  { name: 'Foco em Canto', slug: 'foco-em-canto', description: 'Técnica vocal, extensão, afinação e performance para cantar com controle.', billing_type: 'one_time', type: 'course', status: 'draft' },
  { name: 'Foco em Melismas', slug: 'foco-em-melismas', description: 'Agilidade vocal, riffs, runs e ornamentações para cantar com leveza.', billing_type: 'one_time', type: 'course', status: 'draft' },
  { name: 'Ebooks e Guias', slug: 'ebooks-e-guias', description: 'Materiais complementares para acelerar seus estudos vocais.', billing_type: 'one_time', type: 'course', status: 'draft' },
];

const compactProductsCss = `.admin-products-compact .admin-clean-hero{min-height:220px;padding:34px 36px}.admin-products-compact .admin-clean-hero h1{font-size:clamp(54px,7vw,86px);line-height:.88}.admin-products-compact .admin-course-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))!important;gap:24px!important;align-items:stretch!important}.admin-products-compact .admin-course-card{min-height:0!important;height:auto!important;display:flex!important;flex-direction:column!important;border-radius:28px!important;overflow:visible!important;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.024))!important}.admin-products-compact .admin-course-cover{aspect-ratio:16/10!important;height:auto!important;min-height:0!important;position:relative!important;overflow:hidden!important;border-radius:28px 28px 0 0!important;background:#09090d!important}.admin-products-compact .admin-course-cover img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}.admin-products-compact .admin-course-cover span{height:100%;display:grid;place-items:center;font-size:38px;color:#f5c76b}.admin-products-compact .admin-course-body{flex:1!important;padding:18px 20px 20px!important;display:flex!important;flex-direction:column!important;gap:11px!important}.admin-products-compact .admin-course-body h2{font-size:26px!important;line-height:1.04!important;margin:0!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.admin-products-compact .admin-course-body p{font-size:14px!important;line-height:1.38!important;margin:0!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.admin-products-compact .product-meta-line{margin-top:auto!important;padding-top:12px!important}.admin-products-compact .admin-clean-actions{margin-top:6px!important;display:flex!important;gap:10px!important;flex-wrap:wrap!important}.admin-products-compact .admin-clean-button{padding:11px 16px!important;border-radius:14px!important}.admin-products-compact .product-manager-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}.admin-products-compact .product-manager-row form{display:inline-flex}.admin-products-compact .product-danger{border-color:rgba(255,95,95,.36)!important;color:#ffb4b4!important}.admin-products-compact .product-access-note{font-size:12px;color:rgba(255,255,255,.58)}@media(max-width:720px){.admin-products-compact .admin-clean-hero{padding:28px 22px}.admin-products-compact .admin-course-grid{grid-template-columns:1fr!important;gap:16px!important}.admin-products-compact .admin-course-cover{aspect-ratio:16/9!important}.admin-products-compact .admin-course-body{padding:15px!important}.admin-products-compact .admin-course-body h2{font-size:22px!important}}`;

function slugify(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `produto-${Date.now()}`; }
function money(cents?: number | null) { return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function orderOf(product: ProductRow) { return Number(product.courses?.[0]?.sort_order ?? 9999); }

async function ensureDefaultProducts() {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from('products').select('id,slug').limit(1);
  if ((existing || []).length > 0) return;
  let order = 1;
  for (const item of defaultProducts) {
    const { data: product } = await supabase.from('products').insert({ ...item, price_cents: 0, cta_label: 'Acessar' }).select('id').single();
    if (product?.id) await supabase.from('courses').insert({ product_id: product.id, title: item.name, slug: item.slug, subtitle: item.description.slice(0, 140), description: item.description, status: item.status, sort_order: order });
    order += 1;
  }
}

async function createProduct(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const billingType = String(formData.get('billing_type') || 'one_time');
  const price = Number(formData.get('price') || 0);
  const type = billingType === 'recurring' ? 'subscription' : 'course';
  const slug = slugify(name);
  if (!name) return;
  const { data: last } = await supabase.from('courses').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const sortOrder = Number(last?.sort_order || 0) + 1;
  const { data: product } = await supabase.from('products').insert({ name, slug, description, type, billing_type: billingType, price_cents: Math.round(price * 100), status: 'draft', cta_label: 'Acessar' }).select('id').single();
  if (product?.id) await supabase.from('courses').insert({ product_id: product.id, title: name, slug, subtitle: description.slice(0, 140), description, status: 'draft', sort_order: sortOrder });
  revalidatePath('/admin'); revalidatePath('/admin/produtos'); revalidatePath('/aluno'); revalidatePath('/aluno/biblioteca');
}

async function setProductStatus(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || 'draft');
  if (!id) return;
  await supabase.from('products').update({ status }).eq('id', id);
  await supabase.from('courses').update({ status }).eq('product_id', id);
  revalidatePath('/admin/produtos'); revalidatePath('/aluno'); revalidatePath('/aluno/biblioteca');
}

async function moveProduct(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const id = String(formData.get('id') || '');
  const direction = String(formData.get('direction') || 'up');
  const { data } = await supabase.from('products').select('id,courses(id,sort_order)').neq('status', 'archived');
  const list = ((data || []) as ProductRow[]).filter((p) => p.courses?.[0]?.id).sort((a, b) => orderOf(a) - orderOf(b));
  const index = list.findIndex((p) => p.id === id);
  const targetIndex = direction === 'down' ? index + 1 : index - 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return;
  const current = list[index];
  const target = list[targetIndex];
  await supabase.from('courses').update({ sort_order: orderOf(target) }).eq('id', current.courses?.[0]?.id);
  await supabase.from('courses').update({ sort_order: orderOf(current) }).eq('id', target.courses?.[0]?.id);
  revalidatePath('/admin/produtos'); revalidatePath('/aluno/biblioteca');
}

async function archiveProduct(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const id = String(formData.get('id') || '');
  if (!id) return;
  await supabase.from('products').update({ status: 'archived' }).eq('id', id);
  await supabase.from('courses').update({ status: 'archived' }).eq('product_id', id);
  revalidatePath('/admin/produtos'); revalidatePath('/aluno'); revalidatePath('/aluno/biblioteca');
}

export default async function AdminProductsPage() {
  await ensureDefaultProducts();
  const supabase = createAdminClient();
  const { data } = await supabase.from('products').select('id,name,slug,description,type,status,cover_url,price_cents,billing_type,courses(id,slug,sort_order)').neq('status', 'archived').order('created_at', { ascending: true });
  const products = ((data || []) as ProductRow[]).sort((a, b) => orderOf(a) - orderOf(b));
  return (
    <main className="admin-page-clean admin-products-compact">
      <style dangerouslySetInnerHTML={{ __html: compactProductsCss }} />
      <section className="admin-clean-hero"><div><span className="admin-clean-eyebrow">Escola Foco em Canto</span><h1>Produtos</h1><p>Gerencie ordem na home, liberação de acesso, bloqueio VIP, destino, prévia e remoção.</p></div><label className="admin-clean-button primary" htmlFor="create-product-toggle">Criar produto</label></section>
      <section className="admin-course-grid">{products.map((product, index) => { const isPublished = product.status === 'published'; return <article className="admin-course-card" key={product.id}><div className="admin-course-cover">{product.cover_url ? <img src={product.cover_url} alt={product.name} /> : <span>{product.name.slice(0, 2).toUpperCase()}</span>}</div><div className="admin-course-body"><span className="admin-clean-pill">{product.billing_type === 'recurring' ? 'Assinatura' : 'Pagamento único'} · {isPublished ? 'liberado na home' : 'bloqueado/VIP'}</span><h2>{product.name}</h2><p className="admin-clean-muted">{product.description || 'Sem descrição cadastrada.'}</p><div className="product-meta-line"><strong>{money(product.price_cents)}</strong><small>Ordem {index + 1}</small></div><small className="product-access-note">Publicado libera o card. Rascunho mantém bloqueado com CTA de assinatura.</small><div className="admin-clean-actions"><a className="admin-clean-button primary" href={`/admin/produtos/${product.id}`}>Gerenciar</a><a className="admin-clean-button secondary" href={`/admin/produtos/${product.id}/destino`}>Destino</a><a className="admin-clean-button secondary" href="/aluno/biblioteca">Prévia</a></div><div className="product-manager-row"><form action={moveProduct}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="direction" value="up" /><button className="admin-clean-button secondary" disabled={index === 0}>↑</button></form><form action={moveProduct}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="direction" value="down" /><button className="admin-clean-button secondary" disabled={index === products.length - 1}>↓</button></form><form action={setProductStatus}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="status" value={isPublished ? 'draft' : 'published'} /><button className="admin-clean-button secondary">{isPublished ? 'Bloquear' : 'Liberar'}</button></form><form action={archiveProduct}><input type="hidden" name="id" value={product.id} /><button className="admin-clean-button secondary product-danger">Remover</button></form></div></div></article>; })}</section>
      <input id="create-product-toggle" className="admin-hidden-toggle" type="checkbox" />
      <section id="novo-produto" className="admin-clean-section admin-create-product-panel"><div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Novo produto</span><h2>Criar produto</h2></div><label className="admin-clean-button secondary" htmlFor="create-product-toggle">Fechar</label></div><form className="admin-clean-form" action={createProduct}><label>Tipo de pagamento<select name="billing_type" defaultValue="one_time"><option value="one_time">Pagamento único</option><option value="recurring">Assinatura recorrente</option></select></label><label>Nome do produto<input name="name" placeholder="Ex: Foco em Harmonia" required /></label><label>Descrição<textarea name="description" placeholder="Explique a transformação do produto." /></label><label>Preço<input name="price" type="number" min="0" step="0.01" placeholder="97.00" /></label><button className="admin-clean-button primary" type="submit">Criar produto</button></form></section>
    </main>
  );
}
