import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Search = { saved?: string; error?: string };
function normalizeUrl(value: string) { const raw = value.trim(); if (!raw) return ''; return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; }

async function saveDestination(formData: FormData) {
  'use server';
  const supabase = createAdminClient();
  const productId = String(formData.get('product_id') || '');
  const courseId = String(formData.get('course_id') || '');
  const destination = normalizeUrl(String(formData.get('redirect_url') || ''));
  if (!productId) return;
  const payload = { redirect_url: destination, sales_page_url: destination, sales_url: destination, external_url: destination };
  const first = await supabase.from('products').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', productId);
  if (first.error) {
    const retry = await supabase.from('products').update(payload).eq('id', productId);
    if (retry.error) redirect(`/admin/produtos/${productId}/destino?error=1`);
  }
  if (courseId) await supabase.from('courses').update(payload).eq('id', courseId);
  revalidatePath('/aluno');
  revalidatePath('/admin/produtos');
  revalidatePath(`/admin/produtos/${productId}`);
  redirect(`/admin/produtos/${productId}/destino?saved=1`);
}

const css = `.destination-page{max-width:960px;margin:0 auto;color:#fff;padding:20px}.destination-hero,.destination-card{border:1px solid rgba(245,199,107,.22);border-radius:28px;background:rgba(255,255,255,.045);padding:26px;margin-bottom:18px}.destination-hero h1{font-size:clamp(38px,7vw,72px);letter-spacing:-.06em;line-height:.9;margin:8px 0}.destination-hero p,.destination-note{color:rgba(255,255,255,.68);line-height:1.45}.destination-form{display:grid;gap:16px}.destination-form label{display:grid;gap:8px;color:rgba(255,255,255,.68);font-weight:800}.destination-form input{height:54px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.28);color:#fff;padding:0 16px}.destination-actions{display:flex;gap:12px;flex-wrap:wrap}.destination-button{border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.06);color:#fff;text-decoration:none;font-weight:900;padding:13px 18px}.destination-button.gold{border:0;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.destination-ok{color:#bbf7d0}.destination-error{color:#fecaca}`;

export default async function ProductDestinationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Search> }) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const supabase = createAdminClient();
  const [{ data: product }, { data: course }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('courses').select('*').eq('product_id', id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (!product) return <main className="destination-page"><style dangerouslySetInnerHTML={{ __html: css }} /><section className="destination-card"><h1>Produto não encontrado</h1><a className="destination-button" href="/admin/produtos">Voltar</a></section></main>;
  const currentUrl = product.redirect_url || product.sales_page_url || product.sales_url || product.external_url || product.kiwify_url || '';
  return <main className="destination-page"><style dangerouslySetInnerHTML={{ __html: css }} /><section className="destination-hero"><span>Destino do produto</span><h1>{product.name}</h1><p>Defina para onde o card bloqueado envia o aluno. Use página de vendas enquanto o curso ainda estiver na Kiwify.</p><div className="destination-actions"><a className="destination-button" href={`/admin/produtos/${product.id}?tab=configuracoes`}>Voltar aos detalhes</a><a className="destination-button" href="/admin/produtos">Todos os produtos</a></div></section><section className="destination-card">{query.saved ? <p className="destination-ok">Destino salvo com sucesso.</p> : null}{query.error ? <p className="destination-error">Não foi possível salvar. Verifique se a migração de links foi aplicada no Supabase.</p> : null}<form className="destination-form" action={saveDestination}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="course_id" value={course?.id || ''} /><label>Link de encaminhamento / página de vendas<input name="redirect_url" defaultValue={currentUrl} placeholder="https://harmonia.focoemcanto.com" /></label><p className="destination-note">Cards bloqueados usam este link. Quando o curso migrar para o Hub, você pode trocar esse destino.</p><div className="destination-actions"><button className="destination-button gold" type="submit">Salvar destino</button></div></form></section></main>;
}
