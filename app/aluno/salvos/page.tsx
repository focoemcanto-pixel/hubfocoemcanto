import Link from 'next/link';
import { cookies } from 'next/headers';
import { ChevronLeft, Bookmark } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

function related(value: unknown): any { return Array.isArray(value) ? value[0] : value; }
function initials(name?: string | null) { return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase(); }

export const dynamic = 'force-dynamic';

export default async function SavedPostsPage() {
  const email = (await cookies()).get('hub_access_email')?.value || '';
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null };
  const { data: rows, error } = (profile as any)?.id
    ? await supabase.from('community_saves').select('post_id,created_at,community_posts(id,caption,media_url,created_at,profiles(name,avatar_url),exercises(title,slug))').eq('profile_id', (profile as any).id).order('created_at', { ascending: false })
    : { data: [], error: null };

  return (
    <AppShell>
      <main className="ig-profile-page">
        <header className="ig-edit-topbar"><a href="/aluno/perfil"><ChevronLeft size={24} /> Perfil</a><strong>Salvos</strong><span /></header>
        {error ? <div className="empty-community-feed"><h3>Ative a tabela de favoritos</h3><p>Execute o SQL enviado para listar posts salvos aqui.</p></div> : null}
        <section className="ig-profile-shortcuts">
          {(rows || []).length ? (rows || []).map((row: any) => {
            const post = related(row.community_posts);
            const author = related(post?.profiles);
            const exercise = related(post?.exercises);
            return <Link key={row.post_id} href={`/aluno/comunidade#post-${row.post_id}`}><div style={{display:'flex',alignItems:'center',gap:12}}><span className="instagram-author-avatar">{author?.avatar_url ? <img src={author.avatar_url} alt="" /> : <span>{initials(author?.name)}</span>}</span><div><strong>{exercise?.title || 'Post salvo'}</strong><span>{author?.name || 'Aluno VIP'} · {post?.caption || 'Publicação da comunidade'}</span></div></div><Bookmark size={20} /></Link>;
          }) : <div className="empty-community-feed"><h3>Nenhum favorito ainda.</h3><p>Toque no marcador em um post para salvar aqui.</p><Link className="premium-button gold" href="/aluno/comunidade">Abrir comunidade</Link></div>}
        </section>
      </main>
    </AppShell>
  );
}
