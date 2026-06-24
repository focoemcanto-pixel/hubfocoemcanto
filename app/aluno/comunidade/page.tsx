import { cookies } from 'next/headers';
import Link from 'next/link';
import { FileText, Plus, Video } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

function hasVipSubscription(rows: any[]) { return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status)); }
function feedModeLabel(mode: string) { if (mode === 'recentes') return 'Recentes'; if (mode === 'seguindo') return 'Seguindo'; return 'Para você'; }

export const dynamic = 'force-dynamic';
const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || '/assinar/vip';
const createPostCss = `.community-main-feed,.community-create-strip{overflow:visible!important}.community-create-strip{position:relative;z-index:80}.new-post-menu{position:relative;z-index:1000}.new-post-menu summary{list-style:none;cursor:pointer;display:grid;place-items:center}.new-post-menu summary::-webkit-details-marker{display:none}.new-post-menu .new-post-options{display:none}.new-post-menu[open] .new-post-options{position:absolute;right:0;top:calc(100% + 12px);z-index:99999;width:min(310px,82vw);display:grid;gap:10px;border:1px solid rgba(245,199,107,.35);border-radius:22px;background:linear-gradient(145deg,rgba(18,18,25,.98),rgba(6,6,10,.98));box-shadow:0 24px 90px rgba(0,0,0,.78);padding:12px;opacity:1!important;visibility:visible!important;backdrop-filter:blur(18px)}.new-post-menu[open] .new-post-options:before{content:'';position:absolute;right:30px;top:-8px;width:16px;height:16px;transform:rotate(45deg);background:rgba(18,18,25,.98);border-left:1px solid rgba(245,199,107,.35);border-top:1px solid rgba(245,199,107,.35)}.new-post-options a{position:relative;z-index:1;display:grid;grid-template-columns:34px 1fr;gap:3px 12px;align-items:center;border:1px solid rgba(255,255,255,.14);border-radius:17px;background:rgba(255,255,255,.075);padding:14px;color:#fff;text-decoration:none}.new-post-options a svg{grid-row:span 2;color:#f5c76b}.new-post-options a strong{font-size:18px;line-height:1}.new-post-options a small{color:rgba(255,255,255,.70);font-size:13px;line-height:1.25}.new-post-options a:active,.new-post-options a:hover{border-color:rgba(245,199,107,.55);background:rgba(245,199,107,.12)}@media(max-width:520px){.community-create-strip{z-index:5000}.new-post-menu[open] .new-post-options{position:absolute;right:0;top:calc(100% + 10px);width:min(290px,76vw);border-radius:20px;padding:10px;transform:none}.new-post-options a{padding:13px}.new-post-options a strong{font-size:16px}.new-post-options a small{font-size:12px}}`;

export default async function CommunityPage({ searchParams }: { searchParams?: Promise<{ feed?: string }> }) {
  const params = await searchParams;
  const mode = ['recentes', 'seguindo'].includes(String(params?.feed || '')) ? String(params?.feed) : 'voce';
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const [{ data: posts }, { data: profile }] = await Promise.all([
    supabase.from('community_posts').select('id,profile_id,exercise_id,caption,media_url,likes_count,comments_count,created_at,profiles(name,avatar_url),exercises(title,slug),submissions(file_url,status)').order('created_at', { ascending: false }).limit(60),
    email ? supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null },
  ]);
  const { data: subscriptions } = profile?.id ? await supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id) : { data: [] };
  const feedPosts = (posts || []).map((p: any) => ({ id: p.id, authorId: p.profile_id, authorName: p.profiles?.name || 'Aluno', authorAvatarUrl: p.profiles?.avatar_url || null, mediaUrl: p.media_url || p.submissions?.file_url || null, exerciseTitle: p.exercises?.title || null, exerciseSlug: p.exercises?.slug || null, caption: p.caption || 'Minha prática do dueto.', likesCount: p.likes_count || 0, commentsCount: p.comments_count || 0, createdAt: p.created_at }));
  const hasVipAccess = hasVipSubscription(subscriptions || []);

  return <AppShell><main className="community-instagram-page"><style dangerouslySetInnerHTML={{ __html: createPostCss }} /><section className="community-main-feed"><header className="community-feed-topbar"><div><p className="eyebrow">Comunidade VIP</p><h1>Compartilhe sua evolução.</h1><p>Publique sua prática, receba apoio dos alunos e acompanhe o crescimento do grupo.</p></div></header><section className="community-create-strip"><div className="community-tabs"><Link className={mode === 'voce' ? 'active' : ''} href="/aluno/comunidade">Para você</Link><Link className={mode === 'recentes' ? 'active' : ''} href="/aluno/comunidade?feed=recentes">Recentes</Link><Link className={mode === 'seguindo' ? 'active' : ''} href="/aluno/comunidade?feed=seguindo">Seguindo</Link></div><details className="new-post-menu"><summary><Plus size={30} /></summary><div className="new-post-options"><a href="#nova-publicacao"><FileText size={22} /><strong>Texto</strong><small>Compartilhe uma ideia, dúvida ou conquista.</small></a><Link href="/aluno/biblioteca"><Video size={22} /><strong>Dueto/atividade</strong><small>Escolha o módulo, grave e publique pelo envio.</small></Link></div></details></section><section id="feed-comunidade" className="community-social-feed">{feedPosts.length ? <HomeCommunityFeed initialPosts={feedPosts} hasVipAccess={hasVipAccess} vipCheckoutUrl={VIP_CHECKOUT_URL} /> : <div className="community-empty-filter"><h3>Nenhuma publicação em {feedModeLabel(mode)}.</h3></div>}</section></section></main></AppShell>;
}
