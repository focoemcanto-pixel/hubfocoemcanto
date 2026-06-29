import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'hub-assets';

const css = `.ebook-inline-manager{display:grid;gap:22px}.ebook-inline-grid{display:grid;grid-template-columns:minmax(280px,360px) 1fr;gap:20px}.ebook-inline-list{display:grid;gap:14px}.ebook-inline-card{display:grid;grid-template-columns:116px 1fr;gap:14px;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:14px;background:rgba(255,255,255,.035)}.ebook-inline-card img{width:116px;height:150px;object-fit:cover;border-radius:16px;background:#111}.ebook-inline-card h3{margin:6px 0 5px;font-size:22px}.ebook-inline-card p{margin:0 0 10px;color:rgba(255,255,255,.66);line-height:1.38}.ebook-inline-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ebook-inline-actions form{display:inline-flex}.ebook-open-note{border:1px solid rgba(245,199,107,.28);border-radius:18px;padding:14px 16px;background:rgba(245,199,107,.08);color:rgba(255,255,255,.76)}@media(max-width:900px){.ebook-inline-grid{grid-template-columns:1fr}.ebook-inline-card{grid-template-columns:88px 1fr}.ebook-inline-card img{width:88px;height:116px}}`;

function slugify(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `ebook-${Date.now()}`; }
function money(cents: number) { return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function parseMoney(value: FormDataEntryValue | null) { const raw = String(value || '0').trim(); const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/[^0-9.-]/g, ''); const parsed = Number(normalized || 0); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0; }
function normalizeUrl(value: string) { const raw = String(value || '').trim(); if (!raw) return ''; return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; }

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data } = await supabase.storage.listBuckets();
  if (!data?.some((bucket) => bucket.id === BUCKET || bucket.name === BUCKET)) await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => null);
}

async function uploadImage(supabase: ReturnType<typeof createAdminClient>, file: File, productId: string) {
  if (!file || file.size === 0 || !file.type.startsWith('image/')) return '';
  await ensureBucket(supabase);
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `ebooks/${productId}/${Date.now()}.${safeExt}`;
  await supabase.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type || 'image/jpeg', upsert: true });
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function addEbook(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const productId = String(formData.get('product_id') || '');
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const purchaseUrl = normalizeUrl(String(formData.get('purchase_url') || ''));
  const price = parseMoney(formData.get('price'));
  const sortOrder = Number(formData.get('sort_order') || 0) || 0;
  let imageUrl = normalizeUrl(String(formData.get('image_url') || ''));
  const imageFile = formData.get('image_file');
  if (imageFile instanceof File && imageFile.size > 0) imageUrl = await uploadImage(supabase, imageFile, productId);
  if (!productId || !title) return;
  await supabase.from('ebook_store_items').insert({ product_id: productId, title, slug: `${slugify(title)}-${Date.now()}`, description, image_url: imageUrl, purchase_url: purchaseUrl, price_cents: Math.round(price * 100), sort_order: sortOrder, status: 'published' });
  revalidatePath(`/admin/produtos/${productId}`); revalidatePath(`/admin/produtos/${productId}/ebooks`); revalidatePath('/aluno'); revalidatePath('/aluno/ebooks-e-guias');
}

async function setEbookStatus(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const productId = String(formData.get('product_id') || '');
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || 'draft');
  if (!id) return;
  await supabase.from('ebook_store_items').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath(`/admin/produtos/${productId}`); revalidatePath('/aluno/ebooks-e-guias');
}

async function removeEbook(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const productId = String(formData.get('product_id') || '');
  const id = String(formData.get('id') || '');
  if (!id) return;
  await supabase.from('ebook_store_items').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath(`/admin/produtos/${productId}`); revalidatePath('/aluno/ebooks-e-guias');
}

export async function AdminEbookStoreManager({ productId }: { productId: string }) {
  const supabase = createAdminClient();
  const { data: items } = await supabase.from('ebook_store_items').select('*').eq('product_id', productId).neq('status', 'archived').order('sort_order').order('created_at');
  return <section className="ebook-inline-manager"><style dangerouslySetInnerHTML={{ __html: css }} /><div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Vitrine aberta</span><h2>Ebooks, guias e livros</h2><p className="admin-clean-muted">Aqui cada cadastro é um material diferente. O aluno vê como vitrine aberta, abre detalhes e compra pelo link definido.</p></div><a className="admin-clean-button secondary" href="/aluno/ebooks-e-guias">Ver vitrine</a></div><div className="ebook-open-note">Este produto não usa módulos e aulas. Use este cadastro para subir capa, descrição, valor e link de compra de cada ebook/guia.</div><div className="ebook-inline-grid"><form className="admin-clean-form" action={addEbook} encType="multipart/form-data"><input type="hidden" name="product_id" value={productId} /><h3>Novo ebook/guia</h3><label>Título<input name="title" required placeholder="Ex: Guia de Afinação" /></label><label>Descrição<textarea name="description" placeholder="Resumo, promessa e para quem é." /></label><div className="admin-clean-form-row"><label>Valor<input name="price" type="number" min="0" step="0.01" placeholder="29.90" /></label><label>Ordem<input name="sort_order" type="number" placeholder="1" /></label></div><label>Link de compra<input name="purchase_url" placeholder="https://pay.kiwify.com.br/..." /></label><label>Imagem por URL<input name="image_url" placeholder="https://..." /></label><label>Ou subir imagem<input name="image_file" type="file" accept="image/*" /></label><button className="admin-clean-button primary" type="submit">Adicionar material</button></form><div className="ebook-inline-list">{(items || []).map((item: any) => <article className="ebook-inline-card" key={item.id}>{item.image_url ? <img src={item.image_url} alt="" /> : <img src="/images/placeholder-cover.jpg" alt="" />}<div><span className="admin-clean-pill">{item.status === 'published' ? 'Publicado' : 'Rascunho'} · ordem {item.sort_order || 0}</span><h3>{item.title}</h3><p>{item.description || 'Sem descrição.'}</p><strong>{money(item.price_cents)}</strong><div className="ebook-inline-actions"><a className="admin-clean-button secondary" href={`/aluno/ebooks-e-guias/${item.slug}`}>Prévia</a><form action={setEbookStatus}><input type="hidden" name="product_id" value={productId} /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="status" value={item.status === 'published' ? 'draft' : 'published'} /><button className="admin-clean-button secondary">{item.status === 'published' ? 'Ocultar' : 'Publicar'}</button></form><form action={removeEbook}><input type="hidden" name="product_id" value={productId} /><input type="hidden" name="id" value={item.id} /><button className="admin-clean-button danger">Remover</button></form></div></div></article>)}{!items?.length ? <div className="admin-empty-state"><strong>Nenhum material cadastrado.</strong><p>Cadastre o primeiro ebook/guia no formulário ao lado.</p></div> : null}</div></div></section>;
}
