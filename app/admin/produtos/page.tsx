import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { dailyTrainingSteps, getDailyTrainingExercise, getExercisesByCategory, trainingCategories } from '@/lib/training-center';
import { accessLabel, getCentralAccessRows, saveCentralAccessRule, type CentralAccessLevel } from '@/lib/central-access';

export const dynamic = 'force-dynamic';

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string | null;
  status: string | null;
  cover_url: string | null;
  price_cents: number | null;
  billing_type: string | null;
  redirect_url?: string | null;
  courses?: { id: string; slug: string | null; sort_order?: number | null }[] | null;
};

const defaultProducts = [
  { name: 'Grupo VIP', slug: 'grupo-vip', description: 'Sala de atividades, duetos, comunidade e análises do professor.', billing_type: 'recurring', type: 'subscription', status: 'published' },
  { name: 'Foco em Harmonia', slug: 'foco-em-harmonia', description: 'Curso completo para desenvolver percepção, divisão vocal e segunda voz.', billing_type: 'one_time', type: 'course', status: 'draft' },
  { name: 'Foco em Canto', slug: 'foco-em-canto', description: 'Técnica vocal, extensão, afinação e performance para cantar com controle.', billing_type: 'one_time', type: 'course', status: 'draft' },
  { name: 'Foco em Melismas', slug: 'foco-em-melismas', description: 'Agilidade vocal, riffs, runs e ornamentações para cantar com leveza.', billing_type: 'one_time', type: 'course', status: 'draft' },
  { name: 'Ebooks e Guias', slug: 'ebooks-e-guias', description: 'Materiais complementares para acelerar seus estudos vocais.', billing_type: 'one_time', type: 'course', status: 'draft' },
];

const css = `.admin-products-compact .admin-clean-hero{min-height:220px;padding:34px 36px}.admin-products-compact .admin-clean-hero h1{font-size:clamp(54px,7vw,86px);line-height:.88}.admin-products-compact .admin-course-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))!important;gap:24px!important;align-items:stretch!important}.admin-products-compact .admin-course-card{min-height:0!important;height:auto!important;display:flex!important;flex-direction:column!important;border-radius:28px!important;overflow:visible!important;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.024))!important}.admin-products-compact .admin-course-cover{aspect-ratio:16/10!important;height:auto!important;min-height:0!important;position:relative!important;overflow:hidden!important;border-radius:28px 28px 0 0!important;background:#09090d!important}.admin-products-compact .admin-course-cover img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}.admin-products-compact .admin-course-cover span{height:100%;display:grid;place-items:center;font-size:38px;color:#f5c76b}.admin-products-compact .admin-course-body{flex:1!important;padding:18px 20px 20px!important;display:flex!important;flex-direction:column!important;gap:11px!important}.admin-products-compact .admin-course-body h2{font-size:26px!important;line-height:1.04!important;margin:0!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.admin-products-compact .admin-course-body p{font-size:14px!important;line-height:1.38!important;margin:0!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.product-meta-line{margin-top:auto!important;padding-top:12px!important}.admin-clean-actions{margin-top:6px!important;display:flex!important;gap:10px!important;flex-wrap:wrap!important}.admin-clean-button{padding:11px 16px!important;border-radius:14px!important}.product-manager-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}.product-manager-row form{display:inline-flex}.product-danger{border-color:rgba(255,95,95,.36)!important;color:#ffb4b4!important}.product-access-note{font-size:12px;color:rgba(255,255,255,.58)}.admin-create-product-panel{display:block!important;margin-top:32px!important;border:1px solid rgba(245,199,107,.2)!important;border-radius:28px!important;background:linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.02))!important;padding:24px!important;scroll-margin-top:24px}.admin-clean-form{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px!important}.admin-clean-form label{display:grid;gap:7px;color:rgba(255,255,255,.72);font-weight:850}.admin-clean-form input,.admin-clean-form select,.admin-clean-form textarea{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.24);color:#fff;padding:13px 14px;font:inherit}.admin-clean-form textarea{min-height:110px;resize:vertical}.admin-clean-form .wide{grid-column:1/-1}.status-banner{margin:24px 0 0;border-radius:18px;padding:13px 16px;font-weight:950}.status-banner.good{border:1px solid rgba(81,227,138,.28);background:rgba(81,227,138,.08);color:#82ffad}.central-access-panel{margin:34px 0 0;border:1px solid rgba(245,199,107,.18);border-radius:30px;background:linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.02));padding:26px}.central-access-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}.central-access-head h2{margin:0;font-size:34px;letter-spacing:-.04em}.central-access-head p{margin:8px 0 0;color:rgba(255,255,255,.62);max-width:720px}.central-access-grid{display:grid;gap:18px}.central-access-group{border:1px solid rgba(255,255,255,.09);border-radius:24px;background:rgba(0,0,0,.18);padding:18px}.central-access-group>h3{margin:0 0 14px;color:#f5c76b;text-transform:uppercase;letter-spacing:.12em;font-size:13px}.central-access-row{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:14px;align-items:center;border-top:1px solid rgba(255,255,255,.07);padding:14px 0}.central-access-row:first-of-type{border-top:0}.central-access-row strong{display:block;color:#fff;font-size:16px}.central-access-row small{display:block;margin-top:4px;color:rgba(255,255,255,.52);line-height:1.35}.central-access-row button{height:44px;border:0;border-radius:14px;background:#f5c76b;color:#130d04;font-weight:950;padding:0 12px}.central-access-control{display:grid;grid-template-columns:1fr auto;gap:8px}.access-segment{height:44px;display:grid;grid-template-columns:1fr 1fr;border:1px solid rgba(245,199,107,.22);border-radius:14px;overflow:hidden;background:#08090d}.access-segment label{display:grid;place-items:center;cursor:pointer;color:rgba(255,255,255,.62);font-weight:950;font-size:13px}.access-segment input{display:none}.access-segment label:has(input:checked){background:#f5c76b;color:#130d04}.level-pill{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:4px 8px;margin-left:8px;color:rgba(255,255,255,.68);font-size:11px;text-transform:uppercase}.level-pill.vip{border-color:rgba(245,199,107,.36);color:#f5c76b;background:rgba(245,199,107,.08)}.central-access-nested{margin-left:16px;padding-left:16px;border-left:1px solid rgba(245,199,107,.14)}@media(max-width:720px){.admin-products-compact .admin-clean-hero{padding:28px 22px}.admin-products-compact .admin-course-grid{grid-template-columns:1fr!important;gap:16px!important}.admin-clean-form{grid-template-columns:1fr}.central-access-row{grid-template-columns:1fr}.central-access-control{grid-template-columns:1fr}}`;

function slugify(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `produto-${Date.now()}`; }
function money(cents?: number | null) { return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function orderOf(product: ProductRow) { return Number(product.courses?.[0]?.sort_order ?? 9999); }
function ruleMap(rows: { key: string; level: CentralAccessLevel }[]) { return Object.fromEntries(rows.map((row) => [row.key, row.level])) as Record<string, CentralAccessLevel>; }
function getRule(rules: Record<string, CentralAccessLevel>, key: string) { return rules[key] || 'open'; }
function normalizeUrl(value: string) { const raw = value.trim(); if (!raw) return ''; return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; }

async function safeInsertProduct(payload: Record<string, unknown>, fallback: Record<string, unknown>) {
  const supabase = createAdminClient();
  const first = await supabase.from('products').insert(payload).select('id').single();
  if (!first.error) return first;
  const message = String(first.error.message || '').toLowerCase();
  if (message.includes('column') || message.includes('schema cache')) return supabase.from('products').insert(fallback).select('id').single();
  return first;
}

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
  const coverUrl = normalizeUrl(String(formData.get('cover_url') || '').trim());
  const redirectUrl = normalizeUrl(String(formData.get('redirect_url') || '').trim());
  const status = String(formData.get('status') || 'draft') === 'published' ? 'published' : 'draft';
  const type = billingType === 'recurring' ? 'subscription' : 'course';
  const slug = slugify(String(formData.get('slug') || name));
  if (!name) redirect('/admin/produtos?created=0#novo-produto');
  const { data: last } = await supabase.from('courses').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const sortOrder = Number(last?.sort_order || 0) + 1;
  const basePayload = { name, slug, description, type, billing_type: billingType, price_cents: Math.round(price * 100), status, cta_label: 'Acessar', cover_url: coverUrl, redirect_url: redirectUrl, sales_page_url: redirectUrl, sales_url: redirectUrl, external_url: redirectUrl };
  const fallbackPayload = { name, slug, description, type, billing_type: billingType, price_cents: Math.round(price * 100), status, cta_label: 'Acessar', cover_url: coverUrl };
  const { data: product, error } = await safeInsertProduct(basePayload, fallbackPayload);
  if (!error && product?.id) {
    const baseCourse = { product_id: product.id, title: name, slug, subtitle: description.slice(0, 140), description, status, cover_url: coverUrl, sort_order: sortOrder, redirect_url: redirectUrl, sales_page_url: redirectUrl, sales_url: redirectUrl, external_url: redirectUrl };
    const fallbackCourse = { product_id: product.id, title: name, slug, subtitle: description.slice(0, 140), description, status, cover_url: coverUrl, sort_order: sortOrder };
    const course = await supabase.from('courses').insert(baseCourse);
    if (course.error) await supabase.from('courses').insert(fallbackCourse);
  }
  revalidatePath('/admin/produtos'); revalidatePath('/aluno'); revalidatePath('/aluno/biblioteca');
  redirect(`/admin/produtos?created=${error ? '0' : '1'}#novo-produto`);
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
  redirect('/admin/produtos?productStatus=1');
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
  const current = list[index]; const target = list[targetIndex];
  await supabase.from('courses').update({ sort_order: orderOf(target) }).eq('id', current.courses?.[0]?.id);
  await supabase.from('courses').update({ sort_order: orderOf(current) }).eq('id', target.courses?.[0]?.id);
  revalidatePath('/admin/produtos'); revalidatePath('/aluno'); revalidatePath('/aluno/biblioteca');
  redirect('/admin/produtos?order=1');
}

async function archiveProduct(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const id = String(formData.get('id') || '');
  if (!id) return;
  await supabase.from('products').update({ status: 'archived' }).eq('id', id);
  await supabase.from('courses').update({ status: 'archived' }).eq('product_id', id);
  revalidatePath('/admin/produtos'); revalidatePath('/aluno'); revalidatePath('/aluno/biblioteca');
  redirect('/admin/produtos?archived=1');
}

async function setCentralAccessRule(formData: FormData) {
  'use server';
  const key = String(formData.get('key') || '').trim();
  const level = String(formData.get('level') || 'open') === 'vip' ? 'vip' : 'open';
  const note = String(formData.get('note') || '').trim();
  if (!key) redirect('/admin/produtos?centralSaved=0#central-access');
  await saveCentralAccessRule(key, level, note);
  revalidatePath('/admin/produtos'); revalidatePath('/aluno/central'); revalidatePath('/aluno/central/diarios'); revalidatePath('/aluno/central/personalizado');
  redirect(`/admin/produtos?centralSaved=${encodeURIComponent(key)}#central-access`);
}

function AccessControl({ itemKey, title, description, rules }: { itemKey: string; title: string; description: string; rules: Record<string, CentralAccessLevel> }) {
  const value = getRule(rules, itemKey);
  return <form className="central-access-row" action={setCentralAccessRule}><div><strong>{title}<span className={`level-pill ${value === 'vip' ? 'vip' : ''}`}>{accessLabel(value)}</span></strong><small>{description}</small></div><div className="central-access-control"><input type="hidden" name="key" value={itemKey} /><input type="hidden" name="note" value={description} /><div className="access-segment"><label><input type="radio" name="level" value="open" defaultChecked={value === 'open'} />Aberto</label><label><input type="radio" name="level" value="vip" defaultChecked={value === 'vip'} />Grupo VIP</label></div><button type="submit">Salvar</button></div></form>;
}

export default async function AdminProductsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureDefaultProducts();
  const resolvedSearchParams = await searchParams;
  const created = resolvedSearchParams?.created === '1';
  const changed = Boolean(resolvedSearchParams?.productStatus || resolvedSearchParams?.order || resolvedSearchParams?.archived);
  const centralSaved = Boolean(resolvedSearchParams?.centralSaved);
  const supabase = createAdminClient();
  const [{ data }, accessRows] = await Promise.all([
    supabase.from('products').select('id,name,slug,description,type,status,cover_url,price_cents,billing_type,redirect_url,courses(id,slug,sort_order)').neq('status', 'archived').order('created_at', { ascending: true }),
    getCentralAccessRows(),
  ]);
  const products = ((data || []) as ProductRow[]).sort((a, b) => orderOf(a) - orderOf(b));
  const rules = ruleMap(accessRows as any);
  return (
    <main className="admin-page-clean admin-products-compact">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <section className="admin-clean-hero"><div><span className="admin-clean-eyebrow">Escola Foco em Canto</span><h1>Produtos</h1><p>Crie produtos, publique na Home/Biblioteca, bloqueie com CTA VIP e controle a ordem dos cards.</p></div><a className="admin-clean-button primary" href="#novo-produto">Criar produto</a></section>
      {changed ? <div className="status-banner good">Produto atualizado. A Home e a Biblioteca já foram revalidadas.</div> : null}
      <section className="admin-course-grid">{products.map((product, index) => { const isPublished = product.status === 'published'; return <article className="admin-course-card" key={product.id}><div className="admin-course-cover">{product.cover_url ? <img src={product.cover_url} alt={product.name} /> : <span>{product.name.slice(0, 2).toUpperCase()}</span>}</div><div className="admin-course-body"><span className="admin-clean-pill">{product.billing_type === 'recurring' ? 'Assinatura' : 'Pagamento único'} · {isPublished ? 'liberado na home' : 'bloqueado/VIP'}</span><h2>{product.name}</h2><p className="admin-clean-muted">{product.description || 'Sem descrição cadastrada.'}</p><div className="product-meta-line"><strong>{money(product.price_cents)}</strong><small>Ordem {index + 1}</small></div><small className="product-access-note">Publicado libera o card na Home/Biblioteca. Rascunho mantém o card bloqueado com CTA.</small><div className="admin-clean-actions"><a className="admin-clean-button primary" href={`/admin/produtos/${product.id}`}>Gerenciar</a><a className="admin-clean-button secondary" href={`/admin/produtos/${product.id}/destino`}>Destino</a><a className="admin-clean-button secondary" href="/aluno">Prévia Home</a></div><div className="product-manager-row"><form action={moveProduct}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="direction" value="up" /><button className="admin-clean-button secondary" disabled={index === 0}>↑</button></form><form action={moveProduct}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="direction" value="down" /><button className="admin-clean-button secondary" disabled={index === products.length - 1}>↓</button></form><form action={setProductStatus}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="status" value={isPublished ? 'draft' : 'published'} /><button className="admin-clean-button secondary">{isPublished ? 'Bloquear' : 'Liberar'}</button></form><form action={archiveProduct}><input type="hidden" name="id" value={product.id} /><button className="admin-clean-button secondary product-danger">Remover</button></form></div></div></article>; })}</section>
      <section id="novo-produto" className="admin-clean-section admin-create-product-panel"><div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Novo produto</span><h2>Criar produto</h2></div><a className="admin-clean-button secondary" href="#top">Voltar ao topo</a></div>{created ? <div className="status-banner good">Produto criado. Ele já aparece na Home/Biblioteca conforme o status escolhido.</div> : null}<form className="admin-clean-form" action={createProduct}><label>Tipo de pagamento<select name="billing_type" defaultValue="one_time"><option value="one_time">Pagamento único</option><option value="recurring">Assinatura recorrente</option></select></label><label>Status inicial<select name="status" defaultValue="draft"><option value="draft">Bloqueado/VIP</option><option value="published">Liberado na Home</option></select></label><label>Nome do produto<input name="name" placeholder="Ex: Workshop de Afinação" required /></label><label>Slug opcional<input name="slug" placeholder="workshop-afinacao" /></label><label className="wide">Descrição<textarea name="description" placeholder="Explique a transformação do produto." /></label><label>Preço<input name="price" type="number" min="0" step="0.01" placeholder="97.00" /></label><label>Imagem/capa URL<input name="cover_url" placeholder="https://.../capa.png" /></label><label className="wide">Destino/checkout URL<input name="redirect_url" placeholder="https://pay.kiwify.com.br/... ou página interna" /></label><button className="admin-clean-button primary" type="submit">Criar produto e publicar no sistema</button></form></section>
      <section id="central-access" className="central-access-panel">{centralSaved ? <div className="status-banner good">Permissão salva com sucesso.</div> : null}<div className="central-access-head"><div><span className="admin-clean-eyebrow">Controle granular</span><h2>Central de Atividades</h2><p>Controle a liberação externa e interna da Central. Cada item fica como Aberto ou exclusivo para assinantes do Grupo VIP.</p></div><a className="admin-clean-button secondary" href="/aluno/central">Prévia da Central</a></div><div className="central-access-grid"><div className="central-access-group"><h3>Entradas principais</h3><AccessControl itemKey="central" title="Central inteira" description="Controla o acesso geral à Central de Treinamento." rules={rules} /><AccessControl itemKey="daily" title="Exercícios Diários" description="Controla o card e a entrada dos desafios diários." rules={rules} /><AccessControl itemKey="personalized" title="Personalizados" description="Controla o card e a entrada do treino por objetivo." rules={rules} /><AccessControl itemKey="repertoire" title="Estude seu Repertório" description="Controla o card de estudo de repertório dentro da Central." rules={rules} /></div><div className="central-access-group"><h3>Diários · dias e exercícios internos</h3>{dailyTrainingSteps.map((step) => { const exercise = getDailyTrainingExercise(step); return <div className="central-access-nested" key={step.exerciseNumber}><AccessControl itemKey={`daily_step_${step.exerciseNumber}`} title={`Dia ${step.day} · Atividade ${step.exerciseNumber}`} description={step.title} rules={rules} />{exercise ? <AccessControl itemKey={`exercise_${exercise.slug}`} title={`Exercício interno · ${exercise.title}`} description={exercise.description} rules={rules} /> : null}</div>; })}</div><div className="central-access-group"><h3>Personalizados · categorias e exercícios</h3>{trainingCategories.map((category) => <div className="central-access-nested" key={category.slug}><AccessControl itemKey={`custom_category_${category.slug}`} title={category.title} description={category.description} rules={rules} />{getExercisesByCategory(category.slug).map((exercise) => <AccessControl itemKey={`exercise_${exercise.slug}`} title={exercise.title} description={exercise.description} rules={rules} key={exercise.slug} />)}</div>)}</div></div></section>
    </main>
  );
}
