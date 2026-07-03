import Link from 'next/link';
import { cookies } from 'next/headers';
import type { CSSProperties } from 'react';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

type Product = Record<string, any>;
type Subscription = Record<string, any>;

const studentHeroImage = process.env.NEXT_PUBLIC_STUDENT_HERO_IMAGE || '/images/aluno-hero.jpg';
const HOME_POST_LIMIT = 50;
const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || 'https://pay.kiwify.com.br/HHr4eyM';
const KIWIFY_LOGIN_URL = process.env.NEXT_PUBLIC_KIWIFY_LOGIN_URL || 'https://kiwify.com.br';
const SYSTEM_DUET_CAPTIONS = new Set(['minha prática do dueto.', 'minha pratica do dueto.', 'compartilhou uma prática.', 'compartilhou uma pratica.']);
const covers = [
  'radial-gradient(circle at 60% 18%,rgba(245,199,107,.34),transparent 35%),linear-gradient(145deg,#342414,#07070b)',
  'radial-gradient(circle at 64% 18%,rgba(142,92,255,.34),transparent 36%),linear-gradient(145deg,#211334,#07070b)',
  'radial-gradient(circle at 58% 18%,rgba(55,155,255,.30),transparent 38%),linear-gradient(145deg,#0b203f,#05060a)',
  'radial-gradient(circle at 62% 18%,rgba(46,213,170,.28),transparent 36%),linear-gradient(145deg,#0d2a22,#05060a)',
];

const css = `.premium-student-home{max-width:1180px}.premium-hero{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:32px;background:linear-gradient(90deg,rgba(0,0,0,.9),rgba(28,20,13,.52));box-shadow:0 34px 110px rgba(0,0,0,.48);padding:42px 44px;min-height:300px}.premium-hero:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.86),rgba(0,0,0,.16) 58%,rgba(0,0,0,.64));pointer-events:none}.premium-hero-copy{position:relative;z-index:2}.premium-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(44px,6.2vw,66px);line-height:.92;margin:12px 0 14px;letter-spacing:-.045em}.premium-hero p:not(.eyebrow){max-width:430px;color:#b9b9c3;line-height:1.45}.premium-hero-photo{position:absolute;right:0;top:0;bottom:0;width:52%;background:var(--student-hero-image);background-size:cover;background-position:center right;opacity:.72}.premium-button{display:inline-flex;gap:8px;padding:13px 22px;border-radius:18px;font-weight:900;text-decoration:none}.premium-button.gold{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.premium-button.dark{background:rgba(255,255,255,.08);color:#fff}.hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}.student-course-section{margin-top:22px;border:1px solid rgba(255,255,255,.12);border-radius:26px;background:rgba(255,255,255,.035);padding:18px}.premium-section-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}.premium-section-heading h2{margin:0;font-size:25px}.premium-section-heading a{color:#f5c76b;font-weight:900;text-decoration:none}.student-products-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}.student-product-card{position:relative;min-height:360px;border:1px solid rgba(255,255,255,.12);border-radius:22px;overflow:hidden;background:#111;text-decoration:none;color:#fff;display:grid;align-content:end;box-shadow:0 22px 70px rgba(0,0,0,.24)}.student-product-bg{position:absolute;inset:0;background-size:cover!important;background-position:center!important}.student-product-bg:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.46) 42%,rgba(0,0,0,.94))}.student-product-card.locked .student-product-bg{filter:saturate(.85) brightness(.55)}.student-product-badge{position:absolute;top:14px;left:14px;z-index:3;border-radius:999px;padding:7px 10px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05;text-transform:uppercase;font-weight:950;font-size:10px;letter-spacing:.08em}.student-product-card.locked .student-product-badge{background:rgba(0,0,0,.65);border:1px solid rgba(245,199,107,.34);color:#f5c76b}.student-product-body{position:relative;z-index:2;padding:16px;display:grid;gap:10px}.student-product-body h3{font-family:Georgia,'Times New Roman',serif;text-transform:uppercase;line-height:.95;margin:0;letter-spacing:-.035em;text-shadow:0 4px 22px #000;font-size:26px}.student-product-body p{margin:0;color:rgba(255,255,255,.72);font-size:13px;line-height:1.35}.student-product-button{margin-top:8px;border-radius:14px;padding:11px 12px;text-align:center;font-weight:950;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.premium-community-feed{margin-top:30px}@media(max-width:1100px){.student-products-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.premium-hero{padding:28px 22px;min-height:auto}.premium-hero h1{font-size:42px}.premium-hero-photo{display:none}.student-products-grid{display:flex;gap:14px;overflow-x:auto}.student-product-card{flex:0 0 min(78vw,310px);min-height:410px}}`;

function cleanCaption(value?: string | null) { const text = String(value || '').trim(); return SYSTEM_DUET_CAPTIONS.has(text.toLowerCase()) ? '' : text; }
function submissionUrlFromJoin(value: any) { if (!value) return null; const item = Array.isArray(value) ? value[0] : value; return item?.file_url || null; }
function hasCourse(subscriptions: Subscription[], courseKey: string) { return subscriptions.some((sub) => sub.course_key === courseKey && isAccessActive(sub.status)); }
function styleForCover(cover: string) { return cover.startsWith('radial-gradient') ? { background: cover } : { backgroundImage: `url(${cover})` }; }
function productCover(product: Product | undefined, fallback: string) { return product?.cover_url || product?.image_url || product?.thumbnail_url || product?.cover_image_url || product?.banner_url || product?.card_cover_url || fallback; }
function productOrder(product: Product, index: number) { return Number(product?.courses?.[0]?.sort_order ?? index + 100); }
function productKey(product: Product) { const slug = String(product?.slug || '').toLowerCase(); return slug.includes('ebook') ? 'ebooks' : slug; }
function normalizedProductText(product: Product) { return `${product?.name || ''} ${product?.slug || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function isVipProduct(product: Product) { return normalizedProductText(product).includes('vip'); }
function productTitle(product: Product) { return isVipProduct(product) ? 'Sala de Atividades VIP' : String(product?.name || 'Produto'); }
function productDestination(product: Product) { return product?.redirect_url || product?.sales_page_url || product?.sales_url || product?.external_url || product?.kiwify_url || product?.checkout_url || ''; }
function hasHubModule(product: Product) { return isVipProduct(product) || Boolean(product?.hub_enabled || product?.has_hub_module || product?.internal_url); }
function productHref(product: Product, unlocked: boolean) { if (isVipProduct(product)) return '/aluno/biblioteca#sala-vip'; const destination = productDestination(product); if (!hasHubModule(product)) return destination || (unlocked ? KIWIFY_LOGIN_URL : VIP_CHECKOUT_URL); return unlocked ? `/aluno/biblioteca/${product.slug}` : (destination || VIP_CHECKOUT_URL); }
function productAction(product: Product, unlocked: boolean) { if (isVipProduct(product)) return 'Abrir sala'; if (!hasHubModule(product)) return unlocked ? 'Acessar curso' : 'Ver oferta'; return unlocked ? 'Acessar curso' : 'Ver oferta'; }

export default async function StudentPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const profileResult = email ? await supabase.from('profiles').select('id,name,email').eq('email', email).maybeSingle() : { data: null };
  const profile = profileResult.data || null;
  const [postsResult, productsResult, subscriptionsResult, modulesResult] = await Promise.all([
    supabase.from('community_posts').select('id,profile_id,exercise_id,submission_id,caption,media_url,likes_count,comments_count,created_at,profiles(name,avatar_url),exercises(title,slug),submissions(file_url)').order('created_at', { ascending: false }).limit(HOME_POST_LIMIT),
    supabase.from('products').select('*,courses(id,sort_order)').neq('status', 'archived').order('created_at', { ascending: true }),
    profile?.id ? supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id) : Promise.resolve({ data: [] as Subscription[] }),
    supabase.from('modules').select('cover_url').eq('is_active', true).order('sort_order').limit(1),
  ]);
  const rawPosts = postsResult.data || [];
  const postIds = rawPosts.map((post: any) => post.id).filter(Boolean);
  const authorIds = Array.from(new Set(rawPosts.map((post: any) => post.profile_id).filter(Boolean)));
  const submissionIds = Array.from(new Set(rawPosts.map((post: any) => post.submission_id).filter(Boolean)));
  const [likesResult, savesResult, followsResult, submissionsLookupResult] = profile?.id ? await Promise.all([
    postIds.length ? supabase.from('community_likes').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from('community_saves').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
    authorIds.length ? supabase.from('community_follows').select('following_id').eq('follower_id', profile.id).in('following_id', authorIds) : Promise.resolve({ data: [] }),
    submissionIds.length ? supabase.from('submissions').select('id,file_url').in('id', submissionIds) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, submissionIds.length ? await supabase.from('submissions').select('id,file_url').in('id', submissionIds) : { data: [] }];
  const likedIds = new Set((likesResult.data || []).map((row: any) => row.post_id));
  const savedIds = new Set((savesResult.data || []).map((row: any) => row.post_id));
  const followingIds = new Set((followsResult.data || []).map((row: any) => row.following_id));
  const submissionUrlById = new Map((submissionsLookupResult.data || []).map((row: any) => [row.id, row.file_url]));
  const firstName = profile?.name ? String(profile.name).split(' ')[0] : 'Aluno';
  const subscriptions = (subscriptionsResult.data || []) as Subscription[];
  const hasVip = hasCourse(subscriptions, 'grupo-vip');
  const freeCover = modulesResult.data?.[0]?.cover_url || covers[0];
  const products = ((productsResult.data || []) as Product[]).sort((a, b) => productOrder(a, 0) - productOrder(b, 0));
  const courseCards = products.map((product, index) => { const vip = isVipProduct(product); const subscribed = hasCourse(subscriptions, productKey(product)); const unlocked = vip ? true : subscribed; return { title: productTitle(product), description: vip ? (hasVip ? 'Todos os módulos, duetos, downloads e avaliações.' : 'Módulo 1 aberto grátis. Demais módulos no VIP.') : (product.description || 'Treinamento premium da escola.'), unlocked, href: productHref(product, unlocked), cover: productCover(product, vip ? freeCover : covers[index % covers.length]), action: productAction(product, unlocked) }; });
  const feedPosts = rawPosts.map((post: any) => ({
    id: post.id,
    authorId: post.profile_id,
    authorName: post.profiles?.name || 'Aluno VIP',
    authorAvatarUrl: post.profiles?.avatar_url || null,
    createdAt: post.created_at,
    exerciseTitle: post.exercises?.title || 'Atividade da comunidade',
    exerciseSlug: post.exercises?.slug || null,
    caption: cleanCaption(post.caption),
    mediaUrl: post.media_url || submissionUrlFromJoin(post.submissions) || submissionUrlById.get(post.submission_id) || null,
    likesCount: post.likes_count || 0,
    commentsCount: post.comments_count || 0,
    canDelete: Boolean(profile?.id && post.profile_id === profile.id),
    isLiked: likedIds.has(post.id),
    isSaved: savedIds.has(post.id),
    isFollowing: followingIds.has(post.profile_id),
  }));
  return (
    <AppShell>
      <main className="page app-home premium-student-home">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <section className="premium-hero"><div className="premium-hero-copy"><p className="eyebrow">Escola Foco em Canto ★</p><h1>Olá, {firstName}.<br />Escolha seu treino de hoje.</h1><p>Sua escola vocal organizada por cursos, acessos e progresso real.</p><div className="hero-actions"><Link className="premium-button gold" href="/aluno/biblioteca" prefetch>▶ Abrir biblioteca</Link><Link className="premium-button dark" href="/aluno/perfil" prefetch>Ver avaliações</Link></div></div><div className="premium-hero-photo" aria-hidden="true" style={{ '--student-hero-image': `url(${studentHeroImage})` } as CSSProperties} /></section>
        <section className="student-course-section"><div className="premium-section-heading"><h2>Meus cursos</h2><Link href="/aluno/biblioteca" prefetch>Ver biblioteca →</Link></div><div className="student-products-grid">{courseCards.map((course) => <a className={`student-product-card ${course.unlocked ? 'unlocked' : 'locked'}`} key={course.title} href={course.href}><span className="student-product-badge">{course.unlocked ? 'Liberado' : 'Bloqueado'}</span><div className="student-product-bg" style={styleForCover(course.cover)} /><div className="student-product-body"><h3>{course.title}</h3><p>{course.description}</p><span className="student-product-button">{course.action}</span></div></a>)}</div></section>
        <section className="feed-layout premium-community-feed"><div className="section-heading"><div><p className="eyebrow">Comunidade VIP</p><h2>Atividades recentes</h2></div><Link href="/aluno/comunidade" prefetch>Abrir comunidade</Link></div><HomeCommunityFeed initialPosts={feedPosts} hasVipAccess={hasVip} currentProfileId={profile?.id || null} /></section>
      </main>
    </AppShell>
  );
}
