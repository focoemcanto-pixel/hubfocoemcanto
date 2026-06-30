import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

const VIP_CHECKOUT_URL = 'https://pay.kiwify.com.br/HHr4eyM';

const covers = [
  'radial-gradient(circle at 60% 18%,rgba(245,199,107,.34),transparent 35%),linear-gradient(145deg,#342414,#07070b)',
  'radial-gradient(circle at 64% 18%,rgba(142,92,255,.34),transparent 36%),linear-gradient(145deg,#211334,#07070b)',
  'radial-gradient(circle at 58% 18%,rgba(55,155,255,.30),transparent 38%),linear-gradient(145deg,#0b203f,#05060a)',
  'radial-gradient(circle at 62% 18%,rgba(46,213,170,.28),transparent 36%),linear-gradient(145deg,#0d2a22,#05060a)',
];

const css = `.school-library-page{max-width:1180px}.school-library-hero,.course-room{border:1px solid rgba(255,255,255,.14);border-radius:30px;background:radial-gradient(circle at 80% 10%,rgba(245,199,107,.16),transparent 34%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.28)}.school-library-hero{padding:36px}.school-library-hero h1{font-size:clamp(44px,7vw,78px);line-height:.94;margin:10px 0 12px;letter-spacing:-.055em}.school-library-hero p:not(.eyebrow){color:rgba(248,247,251,.68)}.school-section{margin-top:28px}.school-section-head,.course-room-header{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:18px}.school-section-head h2,.course-room-header h2{font-size:32px;margin:0}.course-access-grid,.module-vertical-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.course-access-card,.module-vertical-card{position:relative;min-height:360px;border:1px solid rgba(255,255,255,.12);border-radius:24px;overflow:hidden;background:#111;color:#fff;text-decoration:none;box-shadow:0 24px 70px rgba(0,0,0,.25);transition:.2s;display:grid;align-content:end}.course-access-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.course-access-card{min-height:390px}.course-access-bg,.module-vertical-bg{position:absolute;inset:0;background-size:cover!important;background-position:center!important}.course-access-bg:after,.module-vertical-bg:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.48) 42%,rgba(0,0,0,.94))}.course-access-card.locked .course-access-bg,.module-vertical-card.frozen .module-vertical-bg{filter:saturate(.75) brightness(.42)}.course-access-badge,.module-status{position:absolute;left:14px;top:14px;z-index:3;border:1px solid rgba(245,199,107,.55);border-radius:999px;padding:7px 10px;background:rgba(245,199,107,.14);color:#f5c76b;text-transform:uppercase;font-size:10px;font-weight:950;letter-spacing:.08em}.course-access-card.unlocked .course-access-badge,.module-vertical-card.free .module-status{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05}.course-access-copy,.module-vertical-copy{position:relative;z-index:2;padding:16px;display:grid;gap:10px}.course-access-copy h3,.module-vertical-copy h3{font-family:Georgia,'Times New Roman',serif;text-transform:uppercase;line-height:.94;letter-spacing:-.04em;margin:0;text-shadow:0 4px 24px #000}.course-access-copy h3{font-size:27px}.module-vertical-copy h3{font-size:30px}.course-access-copy p{margin:0;color:rgba(255,255,255,.72);font-size:13px;line-height:1.35}.course-access-action{border:1px solid rgba(245,199,107,.5);border-radius:14px;padding:12px 14px;text-align:center;font-weight:950;color:#f5c76b;background:rgba(0,0,0,.22)}.course-access-card.unlocked .course-access-action{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07;border:0}.course-room{padding:20px}.course-room-pill{border:1px solid rgba(245,199,107,.35);background:rgba(245,199,107,.08);color:#f5c76b;border-radius:999px;padding:9px 12px;font-weight:900}.module-card-meta{display:flex;justify-content:space-between;color:#d7d7df;font-size:13px}.stream-progress{height:6px;background:rgba(255,255,255,.15);border-radius:999px;overflow:hidden}.stream-progress i{display:block;height:100%;background:linear-gradient(90deg,#f7d46b,#e1aa3b)}.module-lock-layer{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:18px;background:linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,0,0,.72));transition:.2s}.module-lock-layer span{border:1px solid rgba(245,199,107,.55);border-radius:16px;padding:12px 14px;background:rgba(0,0,0,.62);color:#f5c76b;font-weight:950;text-align:center}@media(max-width:1100px){.course-access-grid,.module-vertical-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:620px){.school-library-hero{padding:26px 22px}.school-library-hero h1{font-size:42px}.course-access-grid,.module-vertical-grid{display:flex;overflow-x:auto;gap:14px;padding-bottom:8px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}.course-access-grid::-webkit-scrollbar,.module-vertical-grid::-webkit-scrollbar{display:none}.course-access-card{flex:0 0 min(80vw,320px);min-height:420px}.module-vertical-card{flex:0 0 min(74vw,290px);min-height:390px}.course-room{padding:18px 0 18px 18px;overflow:hidden}.course-room-header{padding-right:18px;display:flex;align-items:center}.course-room-pill{display:inline-flex}.school-section-head{display:block}}`;

function progressFor(index: number) { return [75, 40, 12, 10, 0, 0][index % 6]; }
function isRealModule(module: any) { const description = String(module.description || '').toLowerCase(); return !description.startsWith('conteudos importados da pasta') && !description.startsWith('conteúdos importados da pasta'); }
function hasCourse(subscriptions: any[], courseKey: string) { return subscriptions.some((sub) => sub.course_key === courseKey && isAccessActive(sub.status)); }
function styleForCover(cover: string) { return cover.startsWith('radial-gradient') ? { background: cover } : { backgroundImage: `url(${cover})` }; }
function productLink(product: any, fallback: string) { return product?.member_url || product?.checkout_url || product?.sales_url || product?.external_url || product?.kiwify_url || fallback; }
function productCover(product: any, fallback: string) { return product?.cover_url || product?.image_url || product?.thumbnail_url || product?.cover_image_url || product?.banner_url || product?.card_cover_url || fallback; }
function productOrder(product: any, index: number) { return Number(product?.courses?.[0]?.sort_order ?? index + 100); }
function productKey(product: any) { const slug = String(product?.slug || '').toLowerCase(); return slug.includes('ebook') ? 'ebooks' : slug; }
function isVip(product: any) { return `${product?.name || ''} ${product?.slug || ''}`.toLowerCase().includes('vip'); }

function ModuleCard({ module, index, hasVip }: { module: any; index: number; hasVip: boolean }) {
  const progress = progressFor(index);
  const fallback = covers[index % covers.length];
  const unlocked = hasVip;
  const label = hasVip ? (progress ? 'Em andamento' : 'Módulo') : 'VIP';
  return (
    <a className={`module-vertical-card ${unlocked ? 'free' : 'frozen'}`} href={unlocked ? `/aluno/biblioteca/${module.slug}` : VIP_CHECKOUT_URL}>
      <span className="module-status">{label}</span>
      <div className="module-vertical-bg" style={module.cover_url ? { backgroundImage: `url(${module.cover_url})` } : { background: fallback }} />
      {!unlocked ? <div className="module-lock-layer"><span>Acesso exclusivo VIP</span></div> : null}
      <div className="module-vertical-copy"><h3>{module.title}</h3><div className="module-card-meta"><small>{module.exercises?.length || 0} aulas</small><strong>{unlocked ? `${progress}%` : 'VIP'}</strong></div><div className="stream-progress"><i style={{ width: `${Math.max(8, unlocked ? progress : 8)}%` }} /></div></div>
    </a>
  );
}

export default async function StudentLibraryPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null as any };
  const [{ data }, { data: products }, { data: subscriptions }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,cover_url,sort_order,exercises(id)').eq('is_active', true).order('sort_order'),
    supabase.from('products').select('*,courses(id,sort_order)').neq('status', 'archived').order('created_at', { ascending: true }),
    profile?.id ? supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id) : Promise.resolve({ data: [] }),
  ]);
  const modules = (data || []).filter(isRealModule);
  const activeSubs = (subscriptions || []).filter((sub: any) => isAccessActive(sub.status));
  const productList = ((products || []) as any[]).sort((a, b) => productOrder(a, 0) - productOrder(b, 0));
  const hasVip = hasCourse(activeSubs, 'grupo-vip');
  const courseCards = productList.map((product, index) => {
    const vip = isVip(product);
    const subscribed = hasCourse(activeSubs, productKey(product));
    const unlocked = vip ? hasVip : subscribed || hasVip;
    const title = vip ? 'Sala de Atividades VIP' : product.name;
    const description = vip ? (hasVip ? 'Atividades, duetos e comunidade.' : 'Bloqueado para assinantes VIP. Garanta seu acesso para começar.') : (unlocked ? (product.description || 'Acesso liberado.') : 'Bloqueado. Entre no Grupo VIP para liberar.');
    const href = unlocked ? (vip ? '#sala-vip' : productLink(product, `/aluno/biblioteca/${product.slug}`)) : VIP_CHECKOUT_URL;
    const action = unlocked ? (vip ? 'Abrir módulos' : 'Acessar curso') : 'Liberar no VIP';
    return { title, description, unlocked, href, cover: productCover(product, covers[index % covers.length]), action };
  });

  return (
    <AppShell>
      <main className="page school-library-page">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <section className="school-library-hero"><p className="eyebrow">Biblioteca da escola</p><h1>Escolha seu curso vocal.</h1><p>A Sala de Atividades agora é exclusiva para alunos VIP, com todos os módulos, duetos, downloads e avaliações do professor.</p></section>
        <section className="school-section"><div className="school-section-head"><h2>Meus cursos</h2><span>{courseCards.filter((course) => course.unlocked).length} liberado(s)</span></div><div className="course-access-grid">{courseCards.map((course) => <a className={`course-access-card ${course.unlocked ? 'unlocked' : 'locked'}`} href={course.href} key={course.title}><span className="course-access-badge">{course.unlocked ? 'Liberado' : 'Bloqueado'}</span><div className="course-access-bg" style={styleForCover(course.cover)} /><div className="course-access-copy"><h3>{course.title}</h3><p>{course.description}</p><span className="course-access-action">{course.action}</span></div></a>)}</div></section>
        <section id="sala-vip" className="school-section course-room"><div className="course-room-header"><div><span className="eyebrow">Grupo VIP</span><h2>Sala de Atividades VIP</h2></div><span className="course-room-pill">{modules.length} módulos</span></div><div className="module-vertical-grid">{modules.map((module: any, index: number) => <ModuleCard module={module} index={index} hasVip={hasVip} key={module.id} />)}</div></section>
      </main>
    </AppShell>
  );
}
