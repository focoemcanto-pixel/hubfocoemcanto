import { cookies } from 'next/headers';
import Link from 'next/link';
import { FileText, Plus, Send, Video } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

function hasVipSubscription(rows: any[]) { return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status)); }
function feedModeLabel(mode: string) { if (mode === 'recentes') return 'Recentes'; if (mode === 'seguindo') return 'Seguindo'; return 'Para você'; }
function firstNameOf(name?: string | null) { return String(name || 'Aluno').trim().split(' ')[0] || 'Aluno'; }
function initials(name?: string | null) { return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
const SYSTEM_DUET_CAPTIONS = new Set(['minha prática do dueto.', 'minha pratica do dueto.', 'compartilhou uma prática.', 'compartilhou uma pratica.']);
function cleanCaption(value?: string | null) { const text = String(value || '').trim(); return SYSTEM_DUET_CAPTIONS.has(text.toLowerCase()) ? '' : text; }

export const dynamic = 'force-dynamic';
const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || '/assinar/vip';
const FEED_LIMIT = 8;
const COMMUNITY_POST_SELECT = 'id,profile_id,exercise_id,caption,media_url,likes_count,comments_count,created_at,category,profiles(name,avatar_url),exercises(title,slug),submissions(file_url,status)';
const createPostCss = `.community-instagram-page.community-standalone-page{width:min(780px,calc(100% - 24px));max-width:780px;margin:0 auto;padding:0 0 120px}.community-main-feed{padding-top:34px}.community-social-feed{width:100%;max-width:720px;margin:0 auto}.community-create-strip{position:relative;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:16px}.new-post-menu{position:relative;z-index:999}.new-post-menu summary{list-style:none;cursor:pointer;display:grid;place-items:center}.new-post-menu summary::-webkit-details-marker{display:none}.new-post-options{display:none}.new-post-menu[open] .new-post-options{position:absolute;right:0;top:calc(100% + 12px);width:min(306px,82vw);display:grid;gap:10px;border:1px solid rgba(245,199,107,.35);border-radius:22px;background:linear-gradient(145deg,rgba(18,18,25,.985),rgba(6,6,10,.985));box-shadow:0 24px 90px rgba(0,0,0,.82);padding:12px}.new-post-options a{display:grid;grid-template-columns:34px 1fr;gap:3px 12px;align-items:center;border:1px solid rgba(255,255,255,.14);border-radius:17px;background:rgba(255,255,255,.08);padding:14px;color:#fff;text-decoration:none}.new-post-options a svg{grid-row:span 2;color:#f5c76b}.new-post-options a strong{font-size:18px;line-height:1}.new-post-options a small{color:rgba(255,255,255,.72);font-size:13px;line-height:1.25}.text-only-composer{scroll-margin-top:120px;margin:18px 0 22px;border:1px solid rgba(245,199,107,.22);border-radius:24px;background:linear-gradient(145deg,rgba(245,199,107,.08),rgba(255,255,255,.035));padding:18px}.composer-topline{display:flex;align-items:center;gap:10px;color:#fff;margin-bottom:12px}.composer-avatar{width:38px;height:38px;border-radius:999px;display:grid;place-items:center;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05;font-weight:900}.text-only-composer textarea{width:100%;min-height:120px;border:1px solid rgba(255,255,255,.13);border-radius:18px;background:rgba(0,0,0,.26);color:#fff;padding:14px;font:inherit;resize:vertical}.composer-actions-instagram{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;color:rgba(255,255,255,.62)}.composer-actions-instagram button{border:0;border-radius:16px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05;font-weight:900;padding:12px 16px;display:inline-flex;align-items:center;gap:8px}@media(min-width:769px){.community-instagram-page.community-standalone-page{width:min(980px,calc(100% - 64px))!important;max-width:980px!important;margin:0 auto!important}.community-standalone-inner{width:100%!important}.community-main-feed{width:min(720px,100%)!important;margin:0 auto!important;padding-top:40px!important}.community-feed-topbar{width:100%!important}.community-feed-topbar h1{max-width:620px!important}.community-create-strip{width:100%!important}.community-tabs{display:flex!important;align-items:center!important;gap:28px!important}.community-social-feed{width:100%!important;max-width:560px!important;margin:24px auto 0!important}.community-social-feed .home-insta-feed.instagram-mobile-feed,.community-social-feed .home-insta-feed{width:100%!important;max-width:560px!important;margin:0 auto!important;display:grid!important;grid-template-columns:1fr!important;gap:28px!important}.community-social-feed .home-insta-post.instagram-post-card,.community-social-feed .instagram-post-card{width:100%!important;min-width:0!important;max-width:560px!important;margin:0 auto!important;border-radius:28px!important}.community-social-feed .home-post-media.instagram-reel-media{width:100%!important;min-height:0!important;aspect-ratio:16/9!important}.community-social-feed .home-post-media.instagram-reel-media video,.community-social-feed .community-feed-video{width:100%!important;height:100%!important;object-fit:contain!important}.community-social-feed .text-post-media{aspect-ratio:auto!important}.community-social-feed .instagram-action-row button{transform:none!important}.new-post-menu summary{width:74px!important;height:74px!important;border-radius:999px!important;background:linear-gradient(180deg,#ffe39b,#e9b348)!important;color:#130d05!important}}@media(max-width:520px){.community-instagram-page.community-standalone-page{width:100%;padding-left:12px;padding-right:12px}.composer-actions-instagram{display:grid}.composer-actions-instagram button{justify-content:center;width:100%}}`;

export default async function CommunityPage({ searchParams }: { searchParams?: Promise<{ feed?: string }> }) {
  const params = await searchParams;
  const mode = ['recentes', 'seguindo'].includes(String(params?.feed || '')) ? String(params?.feed) : 'voce';
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('id,name,email').eq('email', email).maybeSingle() : { data: null };
  const [{ data: posts }, { data: subscriptions }] = await Promise.all([
    supabase.from('community_posts').select(COMMUNITY_POST_SELECT).order('created_at', { ascending: false }).limit(FEED_LIMIT),
    profile?.id ? supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id) : Promise.resolve({ data: [] }),
  ]);
  const rawPosts = posts || [];
  const postIds = rawPosts.map((post: any) => post.id).filter(Boolean);
  const authorIds = Array.from(new Set(rawPosts.map((post: any) => post.profile_id).filter(Boolean)));
  const [likesResult, savesResult, followsResult] = profile?.id ? await Promise.all([
    postIds.length ? supabase.from('community_likes').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from('community_saves').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
    authorIds.length ? supabase.from('community_follows').select('following_id').eq('follower_id', profile.id).in('following_id', authorIds) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const likedIds = new Set((likesResult.data || []).map((row: any) => row.post_id));
  const savedIds = new Set((savesResult.data || []).map((row: any) => row.post_id));
  const followingIds = new Set((followsResult.data || []).map((row: any) => row.following_id));
  const feedPosts = rawPosts.map((p: any) => ({
    id: p.id,
    authorId: p.profile_id,
    authorName: p.profiles?.name || 'Aluno',
    authorAvatarUrl: p.profiles?.avatar_url || null,
    mediaUrl: p.media_url || p.submissions?.file_url || null,
    exerciseTitle: p.exercises?.title || null,
    exerciseSlug: p.exercises?.slug || null,
    caption: cleanCaption(p.caption),
    likesCount: p.likes_count || 0,
    commentsCount: p.comments_count || 0,
    createdAt: p.created_at,
    canDelete: Boolean(profile?.id && p.profile_id === profile.id),
    isLiked: likedIds.has(p.id),
    isSaved: savedIds.has(p.id),
    isFollowing: followingIds.has(p.profile_id),
  }));
  const hasVipAccess = hasVipSubscription(subscriptions || []);
  const firstName = firstNameOf(profile?.name);

  return (
    <AppShell>
      <>
        <style dangerouslySetInnerHTML={{ __html: createPostCss }} />
        <main className="community-instagram-page community-standalone-page">
          <div className="community-standalone-inner">
            <section className="community-main-feed">
              <header className="community-feed-topbar"><div><p className="eyebrow">Comunidade VIP</p><h1>Compartilhe sua evolução.</h1><p>Publique sua prática, receba apoio dos alunos e acompanhe o crescimento do grupo.</p></div></header>
              <section className="community-create-strip"><div className="community-tabs"><Link className={mode === 'voce' ? 'active' : ''} href="/aluno/comunidade">Para você</Link><Link className={mode === 'recentes' ? 'active' : ''} href="/aluno/comunidade?feed=recentes">Recentes</Link><Link className={mode === 'seguindo' ? 'active' : ''} href="/aluno/comunidade?feed=seguindo">Seguindo</Link></div><details className="new-post-menu"><summary><Plus size={30} /></summary><div className="new-post-options"><a href="#nova-publicacao"><FileText size={22} /><strong>Texto</strong><small>Ideia, dúvida ou conquista.</small></a><Link href="/aluno/biblioteca"><Video size={22} /><strong>Dueto/atividade</strong><small>Grave e publique.</small></Link></div></details></section>
              <section id="nova-publicacao" className="community-composer-instagram text-only-composer"><div className="composer-topline"><span className="composer-avatar">{initials(firstName)}</span><strong>{firstName}</strong><small>Publicação de texto</small></div><form action="/api/community/posts" method="post"><textarea name="caption" placeholder="O que você treinou hoje? Compartilhe uma prática, dúvida, testemunho ou conquista..." /><div className="composer-actions-instagram"><span>Para publicar vídeo de dueto, escolha uma aula na biblioteca.</span><button type="submit"><Send size={18} /> Publicar texto</button></div></form></section>
              <section id="feed-comunidade" className="community-social-feed">{feedPosts.length ? <HomeCommunityFeed initialPosts={feedPosts} hasVipAccess={hasVipAccess} vipCheckoutUrl={VIP_CHECKOUT_URL} currentProfileId={profile?.id || null} /> : <div className="community-empty-filter"><h3>Nenhuma publicação em {feedModeLabel(mode)}.</h3></div>}</section>
            </section>
          </div>
        </main>
      </>
    </AppShell>
  );
}
