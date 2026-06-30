import Link from 'next/link';
import { cookies } from 'next/headers';
import type { CSSProperties } from 'react';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

type Profile = { id: string; name: string | null; email: string | null } | null;
type Product = Record<string, any>;
type Subscription = Record<string, any>;
type ModuleRow = { id: string; title: string; slug: string; description?: string | null; cover_url?: string | null; exercises?: any[] };

const PRIVATE_TEST_ACCOUNT = 'markuezemarquinhos@hotmail.com';
const studentHeroImage = process.env.NEXT_PUBLIC_STUDENT_HERO_IMAGE || '/images/aluno-hero.jpg';
const VIP_CHECKOUT_URL = 'https://pay.kiwify.com.br/HHr4eyM';
const HARMONIA_URL = 'https://harmonia.focoemcanto.com';
const FOCO_CANTO_URL = 'https://focoemcanto.com';
const HOME_POST_LIMIT = 4;
const HOME_SUBMISSION_FALLBACK_LIMIT = 16;
const covers = [
  'radial-gradient(circle at 60% 18%,rgba(245,199,107,.34),transparent 35%),linear-gradient(145deg,#342414,#07070b)',
  'radial-gradient(circle at 64% 18%,rgba(142,92,255,.34),transparent 36%),linear-gradient(145deg,#211334,#07070b)',
  'radial-gradient(circle at 58% 18%,rgba(55,155,255,.30),transparent 38%),linear-gradient(145deg,#0b203f,#05060a)',
  'radial-gradient(circle at 62% 18%,rgba(46,213,170,.28),transparent 36%),linear-gradient(145deg,#0d2a22,#05060a)',
  'radial-gradient(circle at 62% 18%,rgba(255,115,115,.25),transparent 36%),linear-gradient(145deg,#2e1111,#05060a)',
];

const css = `.premium-student-home{max-width:1180px}.premium-hero{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:32px;background:radial-gradient(circle at 72% 32%,rgba(245,199,107,.2),transparent 35%),linear-gradient(90deg,rgba(0,0,0,.9),rgba(28,20,13,.52));box-shadow:0 34px 110px rgba(0,0,0,.48);padding:42px 44px;min-height:300px}.premium-hero:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.86),rgba(0,0,0,.16) 58%,rgba(0,0,0,.64));pointer-events:none}.premium-hero-copy{position:relative;z-index:2}.premium-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(44px,6.2vw,66px);line-height:.92;margin:12px 0 14px;letter-spacing:-.045em}.premium-hero p:not(.eyebrow){max-width:430px;color:#b9b9c3;line-height:1.45}.premium-hero-photo{position:absolute;right:0;top:0;bottom:0;width:52%;background:var(--student-hero-image);background-size:cover;background-position:center right;opacity:.72}.premium-button{display:inline-flex;gap:8px;padding:13px 22px;border-radius:18px;font-weight:900;text-decoration:none}.premium-button.gold{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.premium-button.dark{background:rgba(255,255,255,.08);color:#fff}.hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}.student-course-section,.premium-continue-panel{margin-top:22px;border:1px solid rgba(255,255,255,.12);border-radius:26px;background:rgba(255,255,255,.035);padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.22)}.premium-section-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}.premium-section-heading h2{margin:0;font-size:25px}.premium-section-heading a{color:#f5c76b;font-weight:900;text-decoration:none}.student-products-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}.student-product-card,.premium-course-card{position:relative;border:1px solid rgba(255,255,255,.12);border-radius:22px;overflow:hidden;background:#111;text-decoration:none;color:#fff;display:grid;align-content:end;transition:.2s;box-shadow:0 22px 70px rgba(0,0,0,.24)}.student-product-card{min-height:360px}.premium-course-card{min-height:320px}.student-product-bg,.course-cover{position:absolute;inset:0;background-size:cover!important;background-position:center!important}.student-product-card.locked .student-product-bg{filter:saturate(.85) brightness(.55)}.student-product-card.locked{opacity:.86}.student-product-overlay,.course-cover:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.46) 42%,rgba(0,0,0,.94))}.student-product-badge,.course-badge{position:absolute;top:14px;left:14px;z-index:3;border-radius:999px;padding:7px 10px;background:rgba(245,199,107,.15);border:1px solid rgba(245,199,107,.55);color:#f5c76b;text-transform:uppercase;font-weight:950;font-size:10px;letter-spacing:.08em}.student-product-card.unlocked .student-product-badge{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05}.student-product-body{position:relative;z-index:2;padding:16px;display:grid;gap:10px}.student-product-body h3,.course-cover strong{font-family:Georgia,'Times New Roman',serif;text-transform:uppercase;line-height:.95;margin:0;letter-spacing:-.035em;text-shadow:0 4px 22px #000}.student-product-body h3{font-size:26px}.course-cover strong{position:absolute;z-index:2;left:14px;right:14px;bottom:74px;font-size:28px}.student-product-body p{margin:0;color:rgba(255,255,255,.72);font-size:13px;line-height:1.35}.student-product-button{margin-top:8px;border:1px solid rgba(245,199,107,.5);border-radius:14px;padding:11px 12px;text-align:center;font-weight:950;color:#f5c76b;background:rgba(0,0,0,.22)}.student-product-card.unlocked .student-product-button{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07;border:0}.premium-course-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.course-meta{position:relative;z-index:2;display:flex;justify-content:space-between;padding:0 12px 8px;color:#c7c7d1;font-size:12px}.premium-course-card .progress{position:relative;z-index:2;margin:0 12px 12px;height:6px}.premium-community-feed{margin-top:30px}.course-resume{position:relative;z-index:2;padding:0 12px 8px;color:#f5c76b;font-size:12px;font-weight:900}@media(max-width:1100px){.student-products-grid,.premium-course-row{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.premium-hero{padding:28px 22px;min-height:auto}.premium-hero h1{font-size:42px}.premium-hero-photo{display:none}.student-course-section,.premium-continue-panel{padding:18px 0 18px 18px;overflow:hidden}.premium-section-heading{padding-right:18px}.student-products-grid,.premium-course-row{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 18px 8px 0;margin-right:-18px;-webkit-overflow-scrolling:touch}.student-products-grid::-webkit-scrollbar,.premium-course-row::-webkit-scrollbar{display:none}.student-product-card{flex:0 0 min(78vw,310px);min-height:410px}.premium-course-card{flex:0 0 min(72vw,280px);min-height:370px}.course-cover strong{font-size:31px}}`;

function getRelated(value: unknown) { return Array.isArray(value) ? value[0] || null : value || null; }
function isRealModule(module: ModuleRow) { return String(module.description || '').toLowerCase().indexOf('importados da pasta') === -1; }
function productLink(product: Product | undefined, fallback: string) { return product?.redirect_url || product?.sales_page_url || product?.sales_url || product?.external_url || product?.kiwify_url || product?.checkout_url || product?.member_url || fallback; }
function unlockedProductLink(product: Product | undefined, fallback: string) { return product?.member_url || product?.course_url || product?.internal_url || productLink(product, fallback); }
function productCover(product: Product | undefined, fallback: string) { return product?.cover_url || product?.image_url || product?.thumbnail_url || product?.cover_image_url || product?.banner_url || product?.card_cover_url || fallback; }
function formatResume(seconds?: number | null) { const value = Math.floor(Number(seconds || 0)); return value > 5 ? `${Math.floor(value / 60)}min ${String(value % 60).padStart(2, '0')}s` : 'aula aberta'; }
function hasCourse(subscriptions: Subscription[], courseKey: string) { return subscriptions.some((sub) => sub.course_key === courseKey && isAccessActive(sub.status)); }
function styleForCover(cover: string) { return cover.startsWith('radial-gradient') ? { background: cover } : { backgroundImage: `url(${cover})` }; }
function productOrder(product: Product, index: number) { return Number(product?.courses?.[0]?.sort_order ?? index + 100); }
function productKey(product: Product) { const slug = String(product?.slug || '').toLowerCase(); return slug.includes('ebook') ? 'ebooks' : slug; }
function normalizedProductText(product: Product) { return `${product?.name || ''} ${product?.slug || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function isVipProduct(product: Product) { return normalizedProductText(product).includes('vip'); }
function isHarmonyProduct(product: Product) { const text = normalizedProductText(product); return text.includes('harmonia') || text.includes('harmon'); }
function isFocoCantoProduct(product: Product) { const text = normalizedProductText(product); return text.includes('foco em canto') || (text.includes('foco') && text.includes('canto') && !text.includes('harmonia')); }
function productTitle(product: Product) { return isVipProduct(product) ? 'Sala de Atividades VIP' : String(product?.name || 'Produto'); }
function lockedProductHref(product: Product, vipHref: string) { if (isVipProduct(product)) return vipHref; if (isHarmonyProduct(product)) return HARMONIA_URL; if (isFocoCantoProduct(product)) return FOCO_CANTO_URL; return productLink(product, vipHref); }
function isAdminEmail(email?: string | null) { return String(email || '').trim().toLowerCase() === PRIVATE_TEST_ACCOUNT; }
function isProgressTableMissing(error: any) { const text = String(error?.message || '').toLowerCase(); return text.includes('does not exist') || text.includes('schema cache') || text.includes('lesson_progress'); }

async function getProgressRows(supabase: ReturnType<typeof createAdminClient>, profileId?: string) {
  if (!profileId) return [];
  const primary = await supabase.from('lesson_progress').select('exercise_id,last_position_seconds,completed,last_watched_at,exercises(id,title,slug,module_id,modules(id,title,slug,cover_url,description,exercises(id)))').eq('profile_id', profileId).order('last_watched_at', { ascending: false }).limit(5);
  if (primary.data?.length) return primary.data;
  if (!primary.error || !isProgressTableMissing(primary.error)) return [];
  const legacy = await supabase.from('exercise_progress').select('exercise_id,completed,completed_at,updated_at,exercises(id,title,slug,module_id,modules(id,title,slug,cover_url,description,exercises(id)))').eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(5);
  return (legacy.data || []).map((row: any) => ({ ...row, last_position_seconds: 0, last_watched_at: row.updated_at || row.completed_at }));
}

export default async function StudentPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const profileResult = email ? await supabase.from('profiles').select('id,name,email').eq('email', email).maybeSingle() : { data: null };
  const profile = (profileResult.data || null) as Profile;
  const postsQuery = supabase.from('community_posts').select('id,profile_id,exercise_id,caption,media_url,likes_count,comments_count,created_at,category,profiles(name,avatar_url),exercises(title,slug),submissions(file_url)').order('created_at', { ascending: false }).limit(HOME_POST_LIMIT);
  if (!isAdminEmail(profile?.email)) postsQuery.neq('category', 'admin_test');
  const [modulesResult, postsResult, submissionsResult, productsResult, subscriptionsResult, progressRows] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,cover_url,sort_order,exercises(id)').eq('is_active', true).order('sort_order'),
    postsQuery,
    supabase.from('submissions').select('profile_id,exercise_id,file_url,created_at').eq('visibility', 'community').order('created_at', { ascending: false }).limit(HOME_SUBMISSION_FALLBACK_LIMIT),
    supabase.from('products').select('*,courses(id,sort_order)').neq('status', 'archived').order('created_at', { ascending: true }),
    profile?.id ? supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id) : Promise.resolve({ data: [] as Subscription[] }),
    getProgressRows(supabase, profile?.id),
  ]);
  const modules = ((modulesResult.data || []) as ModuleRow[]).filter(isRealModule);
  const posts = postsResult.data || [];
  const communitySubmissions = submissionsResult.data || [];
  const products = ((productsResult.data || []) as Product[]).sort((a, b) => productOrder(a, 0) - productOrder(b, 0));
  const subscriptions = (subscriptionsResult.data || []) as Subscription[];
  const firstName = profile?.name ? profile.name.split(' ')[0] : 'Aluno';
  const freeModule = modules.find((module) => `${module.title} ${module.slug}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('firmando') && `${module.title} ${module.slug}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('afinacao'));
  const hasVip = hasCourse(subscriptions, 'grupo-vip');
  const vipHref = VIP_CHECKOUT_URL;
  const courseCards = products.map((product, index) => {
    const vip = isVipProduct(product);
    const subscribed = hasCourse(subscriptions, productKey(product));
    const unlocked = vip ? hasVip : subscribed || hasVip;
    return {
      title: productTitle(product),
      description: vip ? (hasVip ? 'Todos os módulos, duetos, downloads e avaliações.' : 'Módulo bloqueado para assinantes VIP. Garanta seu acesso antes de começar.') : (product.description || 'Treinamento premium da escola.'),
      unlocked,
      href: unlocked ? (vip ? '/aluno/biblioteca#sala-vip' : unlockedProductLink(product, `/aluno/biblioteca/${product.slug}`)) : lockedProductHref(product, vipHref),
      cover: productCover(product, vip ? (freeModule?.cover_url || covers[0]) : covers[index % covers.length]),
      action: unlocked ? (vip ? 'Acessar sala' : 'Acessar curso') : (vip ? 'Liberar no VIP' : 'Ver oferta'),
    };
  });
  const continueItems = (progressRows || []).filter((row: any) => { const exercise = getRelated(row.exercises) as any; return Boolean(exercise?.slug && (row.completed || Number(row.last_position_seconds || 0) > 5 || row.last_watched_at)); }).map((row: any, index: number) => {
    const exercise = getRelated(row.exercises) as any;
    const mod = getRelated(exercise?.modules) as any;
    const moduleLessons = Array.isArray(mod?.exercises) ? mod.exercises.length : 0;
    const percent = row.completed ? 100 : Math.max(8, Math.min(96, Math.round((Number(row.last_position_seconds || 0) / 600) * 100)));
    return { id: row.exercise_id || exercise?.id || index, href: `/aluno/aula/${exercise?.slug || ''}`, title: exercise?.title || 'Última aula', moduleTitle: mod?.title || 'Sala VIP', cover: mod?.cover_url || covers[index % covers.length], lessons: moduleLessons || 1, percent, badge: index === 0 ? 'Última aula' : row.completed ? 'Concluída' : 'Em andamento', resume: row.completed ? 'aula concluída' : `parou em ${formatResume(row.last_position_seconds)}` };
  });
  const postIds = posts.map((post: any) => post.id).filter(Boolean);
  const authorIds = Array.from(new Set(posts.map((post: any) => post.profile_id).filter(Boolean)));
  const [followsResult, likesResult, savesResult] = profile?.id ? await Promise.all([
    authorIds.length ? supabase.from('community_follows').select('following_id').eq('follower_id', profile.id).in('following_id', authorIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from('community_likes').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from('community_saves').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const followingIds = new Set((followsResult.data || []).map((follow: any) => follow.following_id));
  const likedPostIds = new Set((likesResult.data || []).map((like: any) => like.post_id));
  const savedPostIds = new Set((savesResult.data || []).map((save: any) => save.post_id));
  const fallbackSubmissionByKey = new Map<string, string>();
  communitySubmissions.forEach((submission: any) => { const key = `${submission.profile_id}:${submission.exercise_id}`; if (!fallbackSubmissionByKey.has(key) && submission.file_url) fallbackSubmissionByKey.set(key, submission.file_url); });
  const feedPosts = posts.map((post: any) => {
    const exercise = getRelated(post.exercises) as any;
    const author = getRelated(post.profiles) as any;
    const submission = getRelated(post.submissions) as any;
    const fallbackMedia = fallbackSubmissionByKey.get(`${post.profile_id}:${post.exercise_id}`) || '';
    return { id: post.id, authorId: post.profile_id, authorName: author?.name || 'Aluno VIP', authorAvatarUrl: author?.avatar_url || null, createdAt: post.created_at, exerciseTitle: exercise?.title || 'Atividade da comunidade', exerciseSlug: exercise?.slug || null, caption: post.caption || 'Compartilhou uma prática.', mediaUrl: post.media_url || submission?.file_url || fallbackMedia || null, likesCount: post.likes_count || 0, commentsCount: post.comments_count || 0, canDelete: Boolean(profile?.id && profile.id === post.profile_id), isFollowing: followingIds.has(post.profile_id), isLiked: likedPostIds.has(post.id), isSaved: savedPostIds.has(post.id) };
  });
  return (
    <AppShell>
      <main className="page app-home premium-student-home">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <section className="premium-hero"><div className="premium-hero-copy"><p className="eyebrow">Escola Foco em Canto ★</p><h1>Olá, {firstName}.<br />Escolha seu treino de hoje.</h1><p>Sua escola vocal organizada por cursos, acessos e progresso real.</p><div className="hero-actions"><Link className="premium-button gold" href="/aluno/biblioteca" prefetch>▶ Abrir biblioteca</Link><Link className="premium-button dark" href="/aluno/perfil" prefetch>Ver avaliações</Link></div></div><div className="premium-hero-photo" aria-hidden="true" style={{ '--student-hero-image': `url(${studentHeroImage})` } as CSSProperties} /></section>
        <section className="student-course-section"><div className="premium-section-heading"><h2>Meus cursos</h2><Link href="/aluno/biblioteca" prefetch>Ver biblioteca →</Link></div><div className="student-products-grid">{courseCards.map((course) => <a className={`student-product-card ${course.unlocked ? 'unlocked' : 'locked'}`} key={course.title} href={course.href}><span className="student-product-badge">{course.unlocked ? 'Liberado' : 'Bloqueado'}</span><div className="student-product-bg" style={styleForCover(course.cover)} /><div className="student-product-overlay" /><div className="student-product-body"><h3>{course.title}</h3><p>{course.description}</p><span className="student-product-button">{course.action}</span></div></a>)}</div></section>
        {continueItems.length ? <section className="premium-continue-panel"><div className="premium-section-heading"><h2>Continue de onde parou</h2><Link href="/aluno/biblioteca" prefetch>Ver todos →</Link></div><div className="premium-course-row">{continueItems.map((item) => <Link className="premium-course-card" key={item.id} href={item.href} prefetch><div className="course-cover" style={styleForCover(item.cover)}><span className="course-badge">{item.badge}</span><strong>{item.title}</strong></div><div className="course-resume">{item.moduleTitle} · {item.resume}</div><div className="course-meta"><span>{item.lessons} aulas</span><span>{item.percent}%</span></div><div className="progress"><span style={{ width: `${item.percent}%` }} /></div></Link>)}</div></section> : null}
        <section className="feed-layout premium-community-feed"><div className="section-heading"><div><p className="eyebrow">Comunidade VIP</p><h2>Atividades recentes</h2></div><Link href="/aluno/comunidade" prefetch>Abrir comunidade</Link></div><HomeCommunityFeed initialPosts={feedPosts} hasVipAccess={hasVip} /></section>
      </main>
    </AppShell>
  );
}
