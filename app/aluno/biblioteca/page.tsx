import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const links = {
  vip: process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || 'https://dashboard.kiwify.com.br',
  harmonia: process.env.NEXT_PUBLIC_HARMONIA_MEMBER_URL || 'https://dashboard.kiwify.com.br',
  canto: process.env.NEXT_PUBLIC_FOCO_CANTO_CHECKOUT_URL || 'https://dashboard.kiwify.com.br',
  melismas: process.env.NEXT_PUBLIC_MELISMAS_CHECKOUT_URL || 'https://dashboard.kiwify.com.br',
  ebooks: process.env.NEXT_PUBLIC_EBOOKS_CHECKOUT_URL || 'https://dashboard.kiwify.com.br',
};
const covers = [
  'radial-gradient(circle at 60% 18%,rgba(245,199,107,.34),transparent 35%),linear-gradient(145deg,#342414,#07070b)',
  'radial-gradient(circle at 64% 18%,rgba(142,92,255,.34),transparent 36%),linear-gradient(145deg,#211334,#07070b)',
  'radial-gradient(circle at 58% 18%,rgba(55,155,255,.30),transparent 38%),linear-gradient(145deg,#0b203f,#05060a)',
  'radial-gradient(circle at 62% 18%,rgba(46,213,170,.28),transparent 36%),linear-gradient(145deg,#0d2a22,#05060a)',
];
const css = `.school-library-page{max-width:1180px}.school-library-hero{border:1px solid rgba(255,255,255,.14);border-radius:34px;padding:36px;background:radial-gradient(circle at 80% 10%,rgba(245,199,107,.18),transparent 34%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.025));box-shadow:0 32px 100px rgba(0,0,0,.32)}.school-library-hero h1{font-size:clamp(44px,7vw,78px);line-height:.94;margin:10px 0 12px;letter-spacing:-.055em}.school-library-hero p:not(.eyebrow){color:rgba(248,247,251,.68);max-width:660px}.school-section{margin-top:28px}.school-section-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:14px}.school-section-head h2{font-size:30px;margin:0}.school-section-head span,.school-section-head a{color:#f5c76b;font-weight:900;text-decoration:none}.course-access-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.course-access-card,.module-vertical-card{position:relative;border:1px solid rgba(255,255,255,.12);border-radius:24px;overflow:hidden;background:#111;color:#fff;text-decoration:none;box-shadow:0 24px 70px rgba(0,0,0,.25);transition:.2s;display:grid;align-content:end}.course-access-card{min-height:410px}.module-vertical-card{min-height:360px}.course-access-card:hover,.module-vertical-card:hover{transform:translateY(-4px);border-color:rgba(245,199,107,.7)}.course-access-bg,.module-vertical-bg{position:absolute;inset:0;background-size:cover!important;background-position:center!important}.course-access-card.locked .course-access-bg{filter:saturate(.85) brightness(.58)}.course-access-bg:after,.module-vertical-bg:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.46) 42%,rgba(0,0,0,.94))}.course-access-badge,.module-status{position:absolute;left:14px;top:14px;z-index:3;border:1px solid rgba(245,199,107,.55);border-radius:999px;padding:7px 10px;background:rgba(245,199,107,.14);color:#f5c76b;text-transform:uppercase;font-size:10px;font-weight:950;letter-spacing:.08em}.course-access-card.unlocked .course-access-badge{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05}.course-access-copy,.module-vertical-copy{position:relative;z-index:2;padding:18px;display:grid;gap:10px}.course-access-copy h3,.module-vertical-copy h3{font-family:Georgia,'Times New Roman',serif;text-transform:uppercase;line-height:.94;letter-spacing:-.04em;margin:0;text-shadow:0 4px 24px #000}.course-access-copy h3{font-size:31px}.module-vertical-copy h3{font-size:30px}.course-access-copy p{margin:0;color:rgba(255,255,255,.72);line-height:1.35}.course-access-action{border:1px solid rgba(245,199,107,.5);border-radius:14px;padding:12px 14px;text-align:center;font-weight:950;color:#f5c76b;background:rgba(0,0,0,.22)}.course-access-card.unlocked .course-access-action{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07;border:0}.course-room{border:1px solid rgba(255,255,255,.12);border-radius:30px;background:rgba(255,255,255,.035);box-shadow:0 24px 80px rgba(0,0,0,.24);padding:20px}.course-room-header{display:flex;justify-content:space-between;gap:18px;align-items:center;margin-bottom:18px}.course-room-header h2{margin:0;font-size:34px}.course-room-header p{margin:6px 0 0;color:rgba(248,247,251,.64)}.course-room-pill{border:1px solid rgba(245,199,107,.35);background:rgba(245,199,107,.08);color:#f5c76b;border-radius:999px;padding:9px 12px;font-weight:900}.module-vertical-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.module-card-meta{display:flex;justify-content:space-between;color:#d7d7df;font-size:13px}.module-vertical-card .stream-progress{height:6px;background:rgba(255,255,255,.15);border-radius:999px;overflow:hidden}.module-vertical-card .stream-progress i{display:block;height:100%;background:linear-gradient(90deg,#f7d46b,#e1aa3b)}.locked-callout{border:1px dashed rgba(245,199,107,.38);border-radius:22px;padding:20px;background:rgba(245,199,107,.06);color:rgba(248,247,251,.76)}.locked-callout a{color:#f5c76b;font-weight:950}@media(max-width:1020px){.course-access-grid,.module-vertical-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.school-library-hero{padding:26px 22px}.school-library-hero h1{font-size:42px}.course-access-grid,.module-vertical-grid{display:flex;overflow-x:auto;gap:14px;padding-bottom:8px;scroll-snap-type:x mandatory}.course-access-grid::-webkit-scrollbar,.module-vertical-grid::-webkit-scrollbar{display:none}.course-access-card{flex:0 0 min(80vw,320px);min-height:420px}.module-vertical-card{flex:0 0 min(74vw,290px);min-height:390px}.course-room{padding:18px 0 18px 18px;overflow:hidden}.course-room-header{padding-right:18px;display:block}.course-room-pill{display:inline-flex;margin-top:12px}.school-section-head{display:block}.school-section-head span{display:block;margin-top:6px}}`;

function progressFor(index: number) { return [75, 40, 12, 10, 0, 0][index % 6]; }
function isActive(status?: string | null) { return ['active', 'paid', 'trialing', 'approved'].includes(String(status || '').toLowerCase()); }
function subscriptionMatches(sub: any, keywords: string[]) { const name = String(sub?.product_name || '').toLowerCase(); return keywords.some((keyword) => name.includes(keyword)); }
function productLink(product: any, fallback: string) { return product?.member_url || product?.checkout_url || product?.sales_url || product?.external_url || product?.kiwify_url || fallback; }
function isRealModule(module: any) { const description = String(module.description || '').toLowerCase(); return !description.startsWith('conteudos importados da pasta') && !description.startsWith('conteúdos importados da pasta'); }

function ModuleCard({ module, index }: { module: any; index: number }) {
  const progress = progressFor(index);
  const fallback = covers[index % covers.length];
  return (
    <Link className="module-vertical-card" href={`/aluno/biblioteca/${module.slug}`} prefetch>
      <span className="module-status">{progress ? 'Em andamento' : 'Módulo'}</span>
      <div className="module-vertical-bg" style={module.cover_url ? { backgroundImage: `url(${module.cover_url})` } : { background: fallback }} />
      <div className="module-vertical-copy">
        <h3>{module.title}</h3>
        <div className="module-card-meta"><small>{module.exercises?.length || 0} aulas</small><strong>{progress}%</strong></div>
        <div className="stream-progress"><i style={{ width: `${Math.max(8, progress)}%` }} /></div>
      </div>
    </Link>
  );
}

export default async function StudentLibraryPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('id,name,email').eq('email', email).maybeSingle() : { data: null as any };
  const [{ data }, { data: products }, { data: subscriptions }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,cover_url,sort_order,exercises(id)').eq('is_active', true).order('sort_order'),
    supabase.from('products').select('*').order('created_at', { ascending: true }),
    profile?.id ? supabase.from('subscriptions').select('*').eq('profile_id', profile.id) : { data: [] },
  ]);
  const modules = (data || []).filter(isRealModule);
  const activeSubs = (subscriptions || []).filter((sub: any) => isActive(sub.status));
  const findProduct = (terms: string[]) => (products || []).find((product: any) => terms.some((term) => `${product.name || ''} ${product.slug || ''}`.toLowerCase().includes(term)));
  const vipProduct = findProduct(['grupo vip', 'vip']);
  const hasVip = !profile?.id || activeSubs.some((sub: any) => subscriptionMatches(sub, ['vip', 'grupo', 'fh', 'harmonia']));
  const hasHarmonia = hasVip || activeSubs.some((sub: any) => subscriptionMatches(sub, ['harmonia']));
  const courseCards = [
    { title: 'Sala de Atividades VIP', description: 'Atividades, duetos e comunidade.', unlocked: hasVip, href: hasVip ? '#sala-vip' : productLink(vipProduct, links.vip), cover: vipProduct?.cover_url || covers[0], action: hasVip ? 'Abrir módulos' : 'Assinar VIP' },
    { title: 'Foco em Harmonia', description: 'Curso completo. Até migrar, o acesso segue pela Kiwify.', unlocked: hasHarmonia, href: productLink(findProduct(['harmonia']), links.harmonia), cover: findProduct(['harmonia'])?.cover_url || covers[1], action: hasHarmonia ? 'Acessar na Kiwify' : 'Comprar curso' },
    { title: 'Foco em Canto', description: 'Técnica, extensão e performance.', unlocked: false, href: productLink(findProduct(['canto']), links.canto), cover: findProduct(['canto'])?.cover_url || covers[2], action: 'Comprar curso' },
    { title: 'Ebooks e Guias', description: 'Materiais premium complementares.', unlocked: false, href: productLink(findProduct(['ebook', 'guia']), links.ebooks), cover: findProduct(['ebook', 'guia'])?.cover_url || covers[3], action: 'Comprar acesso' },
  ];

  return (
    <AppShell>
      <main className="page school-library-page">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <section className="school-library-hero">
          <p className="eyebrow">Biblioteca da escola</p>
          <h1>Escolha seu curso vocal.</h1>
          <p>Os módulos do Grupo VIP continuam aqui. Os outros cursos aparecem como vitrine bloqueada até serem migrados para dentro do Hub.</p>
        </section>

        <section className="school-section">
          <div className="school-section-head"><h2>Meus cursos</h2><span>{courseCards.filter((course) => course.unlocked).length} liberado(s)</span></div>
          <div className="course-access-grid">{courseCards.map((course) => <a className={`course-access-card ${course.unlocked ? 'unlocked' : 'locked'}`} href={course.href} key={course.title}><span className="course-access-badge">{course.unlocked ? 'Liberado' : '🔒 Bloqueado'}</span><div className="course-access-bg" style={{ background: course.cover?.startsWith('radial-gradient') ? course.cover : undefined, backgroundImage: course.cover?.startsWith('radial-gradient') ? undefined : `url(${course.cover})` }} /><div className="course-access-copy"><h3>{course.title}</h3><p>{course.description}</p><span className="course-access-action">{course.action}</span></div></a>)}</div>
        </section>

        <section id="sala-vip" className="school-section course-room">
          <div className="course-room-header"><div><span className="eyebrow">Grupo VIP</span><h2>Sala de Atividades VIP</h2><p>Estes são os módulos atuais do Hub, organizados dentro do curso certo.</p></div><span className="course-room-pill">{modules.length} módulos</span></div>
          {hasVip ? <div className="module-vertical-grid">{modules.map((module: any, index: number) => <ModuleCard module={module} index={index} key={module.id} />)}</div> : <div className="locked-callout"><strong>Acesso bloqueado.</strong><p>Assine o Grupo VIP para liberar os módulos de atividades, duetos e comunidade.</p><a href={productLink(vipProduct, links.vip)}>Liberar acesso VIP →</a></div>}
        </section>
      </main>
    </AppShell>
  );
}
