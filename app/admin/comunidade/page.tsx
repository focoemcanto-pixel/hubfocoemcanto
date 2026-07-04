import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCommunityPostAction } from '@/components/admin-community-post-action';

export const dynamic = 'force-dynamic';

type Row = any;
const ADMIN_EMAILS = new Set(['markuezemarquinhos@hotmail.com']);
function related(value: unknown) { if (Array.isArray(value)) return value[0] || null; return value || null; }
function canManage(profile?: any) { const email = String(profile?.email || '').trim().toLowerCase(); return ADMIN_EMAILS.has(email); }
function timeAgo(value?: string | null) { if (!value) return 'recente'; const diff = Math.max(0, Date.now() - new Date(value).getTime()); const min = Math.floor(diff / 60000); if (min < 60) return `há ${min}min`; const h = Math.floor(min / 60); if (h < 24) return `há ${h}h`; return new Date(value).toLocaleDateString('pt-BR'); }
function textOf(post: Row, exercise: Row) { return post.caption || exercise?.title || 'Publicação sem texto'; }
function mediaOf(post: Row) { return post.media_url || related(post.submissions)?.file_url || ''; }

export default async function AdminCommunityPage() {
  const supabase = createAdminClient();
  const email = (await cookies()).get('hub_access_email')?.value;
  const { data: currentProfile } = email ? await supabase.from('profiles').select('id,email').eq('email', email).maybeSingle() : { data: null };
  const showAdminAction = canManage(currentProfile);
  const [{ count: postsCount }, { data: posts }, { count: studentsCount }, { count: pendingCount }] = await Promise.all([
    supabase.from('community_posts').select('*', { count: 'exact', head: true }),
    supabase.from('community_posts').select('id,caption,media_url,created_at,profiles(name,email,avatar_url),exercises(title),submissions(file_url)').order('created_at', { ascending: false }).limit(60),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
  ]);
  return <main className="admin-page-clean community-admin-page"><section className="admin-clean-hero"><div><span className="admin-clean-eyebrow">Comunidade</span><h1>Interações do Hub</h1><p>Acompanhe posts, duetos publicados e movimentação dos alunos dentro da escola.</p></div><a className="admin-clean-button secondary" href="/admin">Voltar</a></section><section className="dash-kpis community-kpis"><a href="/admin/comunidade"><span>Publicações</span><strong>{postsCount || 0}</strong><small>posts na comunidade</small><em>💬</em></a><a href="/admin/alunos"><span>Alunos</span><strong>{studentsCount || 0}</strong><small>perfis cadastrados</small><em>👥</em></a><a className="warning" href="/admin/avaliacoes"><span>Avaliações</span><strong>{pendingCount || 0}</strong><small>pendentes de correção</small><em>📋</em></a></section><section className="admin-clean-section"><div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Feed</span><h2>Últimas publicações</h2></div></div><div className="community-post-list">{((posts || []) as Row[]).map((post) => { const profile = related(post.profiles) as Row; const exercise = related(post.exercises) as Row; const media = mediaOf(post); return <article className="community-post-card" key={post.id}><div className="feed-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : String(profile?.name || profile?.email || 'A').slice(0, 1).toUpperCase()}</div><div><h3>{profile?.name || profile?.email || 'Aluno'}</h3><p>{textOf(post, exercise)}</p><small>publicado · {media ? 'vídeo' : 'texto'} · {timeAgo(post.created_at)}</small></div>{media ? <a className="admin-clean-button secondary" href={media} target="_blank" rel="noreferrer">Abrir</a> : null}{showAdminAction ? <AdminCommunityPostAction postId={post.id} /> : null}</article>; })}{!posts?.length ? <p className="admin-clean-muted">Nenhuma publicação encontrada ainda.</p> : null}</div></section></main>;
}
