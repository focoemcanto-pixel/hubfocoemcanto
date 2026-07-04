import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCommunityPostAction } from '@/components/admin-community-post-action';

export const dynamic = 'force-dynamic';

type Row = any;
const ADMIN_EMAILS = new Set(['markuezemarquinhos@hotmail.com']);
function related(value: unknown) { if (Array.isArray(value)) return value[0] || null; return value || null; }
function canManage(profile?: any) { const email = String(profile?.email || '').trim().toLowerCase(); return ADMIN_EMAILS.has(email) || String(profile?.role || '').toLowerCase() === 'admin'; }
function timeAgo(value?: string | null) { if (!value) return 'recente'; const diff = Math.max(0, Date.now() - new Date(value).getTime()); const min = Math.floor(diff / 60000); if (min < 60) return `há ${min}min`; const h = Math.floor(min / 60); if (h < 24) return `há ${h}h`; return new Date(value).toLocaleDateString('pt-BR'); }

export default async function AdminCommunityPage() {
  const supabase = createAdminClient();
  const email = (await cookies()).get('hub_access_email')?.value;
  const { data: currentProfile } = email ? await supabase.from('profiles').select('id,email,role').eq('email', email).maybeSingle() : { data: null };
  const showAdminAction = canManage(currentProfile);
  const [{ count: postsCount }, { data: posts }, { count: studentsCount }, { count: pendingCount }] = await Promise.all([
    supabase.from('community_posts').select('*', { count: 'exact', head: true }),
    supabase.from('community_posts').select('id,content,file_url,file_type,visibility,created_at,profiles(name,email,avatar_url),exercises(title)').order('created_at', { ascending: false }).limit(60),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
  ]);
  return <main className="admin-page-clean community-admin-page"><section className="admin-clean-hero"><div><span className="admin-clean-eyebrow">Comunidade</span><h1>Interações do Hub</h1><p>Acompanhe posts, duetos publicados e movimentação dos alunos dentro da escola.</p></div><a className="admin-clean-button secondary" href="/admin">Voltar</a></section><section className="dash-kpis community-kpis"><a href="/admin/comunidade"><span>Publicações</span><strong>{postsCount || 0}</strong><small>posts na comunidade</small><em>💬</em></a><a href="/admin/alunos"><span>Alunos</span><strong>{studentsCount || 0}</strong><small>perfis cadastrados</small><em>👥</em></a><a className="warning" href="/admin/avaliacoes"><span>Avaliações</span><strong>{pendingCount || 0}</strong><small>pendentes de correção</small><em>📋</em></a></section><section className="admin-clean-section"><div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Feed</span><h2>Últimas publicações</h2></div></div><div className="community-post-list">{((posts || []) as Row[]).map((post) => { const profile = related(post.profiles) as Row; const exercise = related(post.exercises) as Row; return <article className="community-post-card" key={post.id}><div className="feed-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : String(profile?.name || profile?.email || 'A').slice(0, 1).toUpperCase()}</div><div><h3>{profile?.name || profile?.email || 'Aluno'}</h3><p>{post.content || exercise?.title || 'Publicação sem texto'}</p><small>{post.visibility || 'publicado'} · {post.file_type || 'post'} · {timeAgo(post.created_at)}</small></div>{post.file_url ? <a className="admin-clean-button secondary" href={post.file_url} target="_blank" rel="noreferrer">Abrir</a> : null}{showAdminAction ? <AdminCommunityPostAction postId={post.id} /> : null}</article>; })}{!posts?.length ? <p className="admin-clean-muted">Nenhuma publicação encontrada ainda.</p> : null}</div></section></main>;
}
