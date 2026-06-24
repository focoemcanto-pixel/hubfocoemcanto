import { cookies } from 'next/headers';
import Link from 'next/link';
import { Bell, BookOpen, FileText, Headphones, Home, Plus, User, Users, Video } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

type Related = { title?: string; name?: string; slug?: string; file_url?: string; avatar_url?: string; status?: string } | null;
function related(value: unknown): Related { if (Array.isArray(value)) return (value[0] || null) as Related; return (value || null) as Related; }
function initials(name?: string | null) { const value = String(name || 'Aluno').trim(); return value.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function firstNameOf(name?: string | null) { return String(name || 'Marcos').trim().split(' ')[0] || 'Marcos'; }
function Avatar({ name, url, className = '' }: { name?: string | null; url?: string | null; className?: string }) { return <span className={className}>{url ? <img src={url} alt={name || 'Perfil'} /> : <span>{initials(name)}</span>}</span>; }
function hasVipSubscription(rows: any[]) { return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status)); }
function isEvaluatedStatus(status?: string | null) { return ['reviewed', 'approved', 'evaluated', 'completed', 'done'].includes(String(status || '').toLowerCase()); }
function feedModeLabel(mode: string) { if (mode === 'recentes') return 'Recentes'; if (mode === 'seguindo') return 'Seguindo'; return 'Para você'; }
function sortForYou(posts: any[]) { return [...posts].sort((a, b) => ((b.isVipAuthor ? 6 : 0) + (b.isEvaluated ? 5 : 0) + (b.likesCount || 0) * 2 + (b.commentsCount || 0)) - ((a.isVipAuthor ? 6 : 0) + (a.isEvaluated ? 5 : 0) + (a.likesCount || 0) * 2 + (a.commentsCount || 0)) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()); }
export const dynamic = 'force-dynamic';
const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || '/assinar/vip';
const createPostCss = `.community-main-feed,.community-create-strip{overflow:visible!important}.new-post-menu{position:relative;z-index:120}`;

export default async function CommunityPage({ searchParams }: { searchParams?: Promise<{ feed?: string }> }) {
const params=await searchParams; const mode=['recentes','seguindo'].includes(String(params?.feed||''))?String(params?.feed):'voce'; const cookieStore=await cookies(); const email=cookieStore.get('hub_access_email')?.value; const supabase=createAdminClient(); const [{data:posts},{data:communitySubmissions},{data:profile}]=await Promise.all([supabase.from('community_posts').select('id,profile_id,exercise_id,caption,media_url,likes_count,comments_count,created_at,profiles(name,avatar_url),exercises(title,slug),submissions(file_url,status)').order('created_at',{ascending:false}).limit(60),supabase.from('submissions').select('profile_id,exercise_id,file_url,status,created_at').eq('visibility','community').order('created_at',{ascending:false}).limit(100),email?supabase.from('profiles').select('id,name,email,avatar_url').eq('email',email).maybeSingle():{data:null}]);
const firstName=firstNameOf(profile?.name); const currentAvatarUrl=(profile as any)?.avatar_url||null; const feedPosts=(posts||[]).map((p:any)=>({id:p.id,authorName:'Aluno',mediaUrl:p.media_url,caption:p.caption||'',likesCount:p.likes_count||0,commentsCount:p.comments_count||0}));
return <AppShell><main className='community-instagram-page'><style dangerouslySetInnerHTML={{__html:createPostCss}}/><section className='community-main-feed'><header className='community-feed-topbar'><div><p className='eyebrow'>Comunidade VIP</p><h1>Compartilhe sua evolução.</h1></div></header><section className='community-create-strip'><div className='community-tabs'><Link className={mode==='voce'?'active':''} href='/aluno/comunidade'>Para você</Link><Link className={mode==='recentes'?'active':''} href='/aluno/comunidade?feed=recentes'>Recentes</Link><Link className={mode==='seguindo'?'active':''} href='/aluno/comunidade?feed=seguindo'>Seguindo</Link></div><details className='new-post-menu'><summary><Plus size={30}/></summary><div className='new-post-options'><a href='/aluno/comunidade/publicar-texto'><FileText size={22}/><strong>Texto</strong><small>Compartilhe uma ideia, dúvida ou conquista.</small></a><Link href='/aluno/biblioteca'><Video size={22}/><strong>Dueto/atividade</strong><small>Escolha o módulo, grave e publique pelo envio.</small></Link></div></details></section><section id='feed-comunidade' className='community-social-feed'>{feedPosts.length?<HomeCommunityFeed initialPosts={feedPosts} hasVipAccess={hasVipSubscription([])} vipCheckoutUrl={VIP_CHECKOUT_URL}/>:<div className='community-empty-filter'><h3>Nenhuma publicação em {feedModeLabel(mode)}.</h3></div>}</section></section></main></AppShell>
}