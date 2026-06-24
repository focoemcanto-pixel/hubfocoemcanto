import Link from 'next/link';
import { cookies } from 'next/headers';
import { BarChart3, Bookmark, BookOpen, ChevronRight, Clock3, Crown, Edit3, LogOut, PlaySquare, Settings, ShieldCheck, Star, UserRoundCheck, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { VocalProfileCard } from '@/components/vocal/vocal-profile-card';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

function initials(name?: string | null) {
  return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function usernameFrom(profile: any, email: string) {
  const base = String(profile?.headline || profile?.name || email?.split('@')[0] || 'aluno')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]+/g, '')
    .slice(0, 24);
  return base || 'alunovip';
}

function productLink(product: any, fallback: string) {
  return product?.checkout_url || product?.sales_url || product?.external_url || product?.kiwify_url || product?.member_url || fallback;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function safeCount(query: PromiseLike<{ count: number | null }>) {
  try {
    const result = await query;
    return result.count || 0;
  } catch {
    return 0;
  }
}

async function safeQuery<T>(query: PromiseLike<{ data: T | null }>, fallback: T) {
  try {
    const result = await query;
    return result.data ?? fallback;
  } catch {
    return fallback;
  }
}

const vocalProfileCss = `.vocal-profile-card{position:relative;overflow:hidden;border:1px solid rgba(103,232,249,.18);border-radius:28px;background:radial-gradient(circle at 85% 0,rgba(103,232,249,.16),transparent 34%),linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.025));box-shadow:0 22px 72px rgba(0,0,0,.28);padding:22px;color:#fff}.vocal-profile-card__glow{position:absolute;inset:auto -20% -55% -20%;height:160px;background:radial-gradient(circle,rgba(245,199,107,.18),transparent 65%);pointer-events:none}.vocal-profile-card header{position:relative;display:flex;gap:14px;align-items:center;margin-bottom:16px}.vocal-profile-card header>span{display:grid;place-items:center;width:48px;height:48px;border-radius:18px;background:rgba(103,232,249,.11);color:#67e8f9}.vocal-profile-card p{margin:0;color:rgba(255,255,255,.68);line-height:1.4}.vocal-profile-card h2{margin:2px 0 0;font-size:26px;letter-spacing:-.04em}.vocal-profile-card__grid{position:relative;display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px}.vocal-profile-card__grid article{border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(0,0,0,.22);padding:14px}.vocal-profile-card__grid small{display:block;color:rgba(255,255,255,.55);margin-bottom:6px}.vocal-profile-card__grid strong{font-size:18px}.vocal-profile-card a{position:relative;margin-top:16px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:16px;background:linear-gradient(180deg,#ffe29a,#ecae35);color:#130d04;text-decoration:none;font-weight:950;padding:13px 16px}@media(max-width:760px){.vocal-profile-card__grid{grid-template-columns:1fr}}`;

const profileCss = `.ig-profile-page{max-width:980px;margin:0 auto;padding:18px 18px 118px;color:#fff}.premium-profile-shell{display:grid;gap:16px}.premium-profile-hero{position:relative;overflow:hidden;border:1px solid rgba(245,199,107,.22);border-radius:30px;background:radial-gradient(circle at 78% 0,rgba(245,199,107,.16),transparent 34%),linear-gradient(135deg,rgba(255,255,255,.075),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.38);padding:26px}.premium-profile-hero:before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.055),transparent 42%,rgba(245,199,107,.05));pointer-events:none}.premium-profile-head{position:relative;z-index:1;display:grid;grid-template-columns:auto 1fr minmax(230px,320px);gap:22px;align-items:start}.premium-profile-avatar{position:relative;display:grid;place-items:center;width:132px;height:132px;border-radius:50%;background:linear-gradient(135deg,#ff4f72,#ffc869,#8768ff);box-shadow:0 24px 62px rgba(0,0,0,.45);text-decoration:none}.premium-profile-avatar:before{content:'';position:absolute;inset:6px;border-radius:50%;background:#121216}.premium-profile-avatar img,.premium-profile-avatar span{position:relative;z-index:1;width:108px;height:108px;border-radius:50%;display:grid;place-items:center;object-fit:cover;background:radial-gradient(circle,rgba(245,199,107,.14),rgba(0,0,0,.46));font-size:48px;font-weight:950;color:#f5c76b}.premium-profile-avatar b{position:absolute;right:0;bottom:10px;z-index:2;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#16171d;border:1px solid rgba(255,255,255,.18);color:#f5c76b}.premium-profile-identity h1{font-size:34px;letter-spacing:-.045em;margin:4px 0 0}.premium-profile-identity p{margin:4px 0 0;color:rgba(255,255,255,.62);font-size:18px}.premium-profile-identity .bio{margin-top:18px;color:rgba(255,255,255,.86);font-size:18px;line-height:1.35;max-width:390px}.premium-vip-card{border:1px solid rgba(245,199,107,.26);border-radius:22px;background:linear-gradient(135deg,rgba(245,199,107,.14),rgba(255,255,255,.035));padding:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}.premium-vip-card strong{display:flex;align-items:center;gap:9px;color:#f5c76b;font-size:19px}.premium-vip-card p{margin:10px 0 14px;color:rgba(255,255,255,.72);line-height:1.35}.premium-vip-card a,.premium-profile-button.gold{display:flex;align-items:center;justify-content:center;gap:9px;text-decoration:none;border:0;border-radius:17px;background:linear-gradient(180deg,#ffe29a,#ecae35);color:#130d04;font-weight:950;padding:14px 18px;box-shadow:0 18px 46px rgba(245,179,62,.18)}.premium-profile-stats{position:relative;z-index:1;margin-top:24px;display:grid;grid-template-columns:repeat(4,1fr);border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(0,0,0,.16);overflow:hidden}.premium-profile-stats a{display:grid;place-items:center;gap:6px;min-height:112px;text-decoration:none;color:#fff;border-left:1px solid rgba(255,255,255,.10)}.premium-profile-stats a:first-child{border-left:0}.premium-profile-stats svg{color:#f5c76b}.premium-profile-stats strong{font-size:30px;letter-spacing:-.04em}.premium-profile-stats span{color:rgba(255,255,255,.65)}.premium-profile-actions{position:relative;z-index:1;margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.premium-profile-button{display:flex;align-items:center;justify-content:center;gap:9px;text-decoration:none;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.045);color:#fff;font-weight:950;min-height:58px}.premium-profile-list,.premium-profile-summary,.premium-profile-settings{border:1px solid rgba(255,255,255,.12);border-radius:26px;background:linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.025));overflow:hidden;box-shadow:0 20px 70px rgba(0,0,0,.22)}.premium-profile-row{display:flex;align-items:center;gap:15px;min-height:82px;padding:0 18px;text-decoration:none;color:#fff;border-top:1px solid rgba(255,255,255,.08)}.premium-profile-row:first-child{border-top:0}.premium-profile-row-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(245,199,107,.08);color:#f5c76b}.premium-profile-row div:nth-child(2){flex:1}.premium-profile-row strong{display:block;font-size:18px}.premium-profile-row span{display:block;margin-top:3px;color:rgba(255,255,255,.62)}.premium-profile-row b{color:rgba(255,255,255,.48);font-size:30px}.premium-profile-summary{padding:20px}.premium-profile-summary header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.premium-profile-summary h2{margin:0;font-size:24px;letter-spacing:-.035em}.premium-profile-summary header a{color:#f5c76b;text-decoration:none;font-weight:900}.premium-profile-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid rgba(255,255,255,.10);border-radius:18px;overflow:hidden;background:rgba(0,0,0,.15)}.premium-profile-summary-grid article{display:grid;place-items:center;gap:8px;min-height:96px;border-left:1px solid rgba(255,255,255,.09)}.premium-profile-summary-grid article:first-child{border-left:0}.premium-profile-summary-grid strong{font-size:30px}.premium-profile-summary-grid span{color:rgba(255,255,255,.62)}.premium-profile-settings form{margin:0}.premium-profile-settings button{width:100%;border:0;background:transparent;color:#ff7474;text-align:left;font:inherit;font-weight:900}.premium-profile-settings .premium-profile-row.logout .premium-profile-row-icon{color:#ff7474;background:rgba(255,116,116,.08)}@media(max-width:760px){.ig-profile-page{padding:14px 14px 112px}.premium-profile-hero{padding:18px;border-radius:26px}.premium-profile-head{grid-template-columns:auto 1fr;gap:16px}.premium-vip-card{grid-column:1/-1}.premium-profile-avatar{width:108px;height:108px}.premium-profile-avatar img,.premium-profile-avatar span{width:88px;height:88px;font-size:40px}.premium-profile-avatar b{width:34px;height:34px}.premium-profile-identity h1{font-size:29px}.premium-profile-identity p{font-size:16px}.premium-profile-identity .bio{font-size:16px;margin-top:12px}.premium-profile-stats{grid-template-columns:repeat(4,1fr);margin-top:18px}.premium-profile-stats a{min-height:92px}.premium-profile-stats strong{font-size:24px}.premium-profile-stats span{font-size:12px}.premium-profile-actions{grid-template-columns:1fr 1fr}.premium-profile-button{min-height:52px;font-size:15px}.premium-profile-row{min-height:76px;padding:0 16px}.premium-profile-row strong{font-size:17px}.premium-profile-summary-grid article{min-height:84px}.premium-profile-summary-grid strong{font-size:26px}}`;

export default async function ProfilePage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const cookieStore = await cookies();
  const { data: { user } } = await supabase.auth.getUser();
  const accessEmail = cookieStore.get('hub_access_email')?.value || user?.email || '';
  const { data: profile } = accessEmail ? await admin.from('profiles').select('*').eq('email', accessEmail).maybeSingle() : user ? await admin.from('profiles').select('*').eq('auth_user_id', user.id).maybeSingle() : { data: null };
  const profileAny = (profile || {}) as any;
  const profileId = profileAny?.id;

  const [postsCount, followersCount, followingCount, submissionsCount, reviewsCount, pendingCount, vocalProfile] = await Promise.all([
    profileId ? safeCount(admin.from('community_posts').select('id', { count: 'exact', head: true }).eq('profile_id', profileId)) : 0,
    profileId ? safeCount(admin.from('community_follows').select('id', { count: 'exact', head: true }).eq('following_id', profileId)) : 0,
    profileId ? safeCount(admin.from('community_follows').select('id', { count: 'exact', head: true }).eq('follower_id', profileId)) : 0,
    profileId ? safeCount(admin.from('submissions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId)) : 0,
    profileId ? safeCount(admin.from('submissions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).in('status', ['reviewed', 'approved', 'needs_rework'])) : 0,
    profileId ? safeCount(admin.from('submissions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).eq('status', 'pending_review')) : 0,
    profileId ? safeQuery<any>(admin.from('vocal_profiles').select('*').eq('profile_id', profileId).maybeSingle(), null) : null,
  ]);

  const subscriptions = profileId ? await safeQuery<any[]>(admin.from('subscriptions').select('*').eq('profile_id', profileId), []) : [];
  const vipProduct = await safeQuery<any>(admin.from('products').select('*').or('slug.ilike.%vip%,name.ilike.%vip%').limit(1).maybeSingle(), null);
  const vipSubscription = subscriptions.find((sub: any) => ['grupo-vip', 'vip', 'foco-vip'].includes(String(sub.course_key || sub.product_slug || sub.slug || '').toLowerCase()) && isAccessActive(sub.status));
  const isVip = Boolean(vipSubscription);
  const vipCheckout = productLink(vipProduct, process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || '/aluno/biblioteca');
  const vipExpires = formatDate(vipSubscription?.ends_at || vipSubscription?.expires_at || vipSubscription?.current_period_end);
  const name = profileAny?.name || accessEmail?.split('@')[0] || 'Aluno';
  const handle = usernameFrom(profileAny, accessEmail);
  const bio = String(profileAny?.bio || '').trim() || 'Foco, disciplina e harmonia. Evoluindo todos os dias.';

  return (
    <AppShell>
      <style dangerouslySetInnerHTML={{ __html: profileCss + vocalProfileCss }} />
      <main className="ig-profile-page premium-profile-shell">
        <section className="premium-profile-hero">
          <div className="premium-profile-head">
            <Link className="premium-profile-avatar" href="/aluno/perfil/editar" aria-label="Editar foto de perfil">
              {profileAny?.avatar_url ? <img src={profileAny.avatar_url} alt={name} /> : <span>{initials(name)}</span>}
              <b><Edit3 size={18} /></b>
            </Link>

            <div className="premium-profile-identity">
              <h1>{name}</h1>
              <p>@{handle}</p>
              <div className="bio">{bio}</div>
            </div>

            <aside className="premium-vip-card">
              {isVip ? (
                <>
                  <strong><Star size={21} fill="currentColor" /> Aluno VIP</strong>
                  <p>{vipExpires ? `Acesso ativo até ${vipExpires}.` : 'Acesso VIP ativo na plataforma.'}</p>
                  <Link href="/aluno/biblioteca">Acessar benefícios</Link>
                </>
              ) : (
                <>
                  <strong><Crown size={22} fill="currentColor" /> Seja Aluno VIP</strong>
                  <p>Tenha acesso a aulas exclusivas, feedbacks e benefícios especiais.</p>
                  <a href={vipCheckout}>Quero ser VIP</a>
                </>
              )}
            </aside>
          </div>

          <nav className="premium-profile-stats" aria-label="Estatísticas do perfil">
            <Link href="/aluno/comunidade"><PlaySquare size={24} /><strong>{postsCount}</strong><span>publicações</span></Link>
            <Link href="/aluno/perfil/seguidores"><Users size={24} /><strong>{followersCount}</strong><span>seguidores</span></Link>
            <Link href="/aluno/perfil/seguindo"><UserRoundCheck size={24} /><strong>{followingCount}</strong><span>seguindo</span></Link>
            <Link href="/aluno/avaliacoes"><Star size={24} /><strong>{reviewsCount}</strong><span>avaliações</span></Link>
          </nav>

          <div className="premium-profile-actions">
            <Link className="premium-profile-button gold" href="/aluno/perfil/editar"><Edit3 size={19} /> Editar perfil</Link>
            <Link className="premium-profile-button" href="/aluno/avaliacoes"><BarChart3 size={20} /> Ver desempenho</Link>
          </div>
        </section>

        <VocalProfileCard vocalProfile={vocalProfile as any} />

        <section className="premium-profile-list">
          <Link className="premium-profile-row" href="/aluno/avaliacoes"><span className="premium-profile-row-icon"><ShieldCheck size={23} /></span><div><strong>Minhas avaliações</strong><span>{reviewsCount} recebidas · {pendingCount} aguardando</span></div><b>›</b></Link>
          <Link className="premium-profile-row" href="/aluno/salvos"><span className="premium-profile-row-icon"><Bookmark size={23} /></span><div><strong>Salvos</strong><span>Posts favoritos da comunidade</span></div><b>›</b></Link>
          <Link className="premium-profile-row" href="/aluno/comunidade"><span className="premium-profile-row-icon"><PlaySquare size={23} /></span><div><strong>Minhas publicações</strong><span>Veja e interaja com a comunidade</span></div><b>›</b></Link>
          <Link className="premium-profile-row" href="/aluno/perfil/seguindo"><span className="premium-profile-row-icon"><Users size={23} /></span><div><strong>Seguindo</strong><span>Acompanhe alunos que você segue</span></div><b>›</b></Link>
          <Link className="premium-profile-row" href="/aluno/biblioteca"><span className="premium-profile-row-icon"><Clock3 size={23} /></span><div><strong>Atividades enviadas</strong><span>{submissionsCount} exercícios gravados</span></div><b>›</b></Link>
        </section>

        <section className="premium-profile-summary">
          <header><h2>Resumo da Jornada</h2><Link href="/aluno/avaliacoes">Ver tudo</Link></header>
          <div className="premium-profile-summary-grid">
            <article><strong>{submissionsCount}</strong><span>atividades</span></article>
            <article><strong>{reviewsCount}</strong><span>avaliações</span></article>
            <article><strong>{pendingCount}</strong><span>na fila</span></article>
          </div>
        </section>

        <section className="premium-profile-settings">
          <Link className="premium-profile-row" href="/aluno/perfil/editar"><span className="premium-profile-row-icon"><Settings size={23} /></span><div><strong>Configurações do perfil</strong></div><b>›</b></Link>
          <Link className="premium-profile-row" href="/aluno/comunidade"><span className="premium-profile-row-icon"><Users size={23} /></span><div><strong>Comunidade</strong></div><b>›</b></Link>
          <Link className="premium-profile-row" href="/aluno/biblioteca"><span className="premium-profile-row-icon"><BookOpen size={23} /></span><div><strong>Biblioteca</strong></div><b>›</b></Link>
          <form action="/auth/logout" method="post"><button className="premium-profile-row logout" type="submit"><span className="premium-profile-row-icon"><LogOut size={23} /></span><div><strong>Sair da conta</strong></div><b>›</b></button></form>
        </section>
      </main>
    </AppShell>
  );
}
