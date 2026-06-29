import { cookies } from 'next/headers';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { VocalRangeTestV3 } from '@/components/vocal/vocal-range-test-v3';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function VocalProfilePage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const cookieStore = await cookies();
  const { data: { user } } = await supabase.auth.getUser();
  const accessEmail = cookieStore.get('hub_access_email')?.value || user?.email || '';
  const { data: profile } = accessEmail ? await admin.from('profiles').select('*').eq('email', accessEmail).maybeSingle() : user ? await admin.from('profiles').select('*').eq('auth_user_id', user.id).maybeSingle() : { data: null };
  const profileId = (profile as any)?.id;
  const { data: vocalProfile } = profileId ? await admin.from('vocal_profiles').select('*').eq('profile_id', profileId).maybeSingle() : { data: null };

  return (
    <AppShell>
      {!profileId ? (
        <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, color: '#fff', background: '#050507' }}>
          <section style={{ maxWidth: 520, border: '1px solid rgba(255,255,255,.12)', borderRadius: 28, padding: 28, textAlign: 'center', background: 'rgba(255,255,255,.05)' }}>
            <h1>Não encontramos seu perfil.</h1>
            <p>Faça login novamente para criar seu Mapa Vocal.</p>
            <Link href="/login" style={{ color: '#f5c76b', fontWeight: 900 }}>Voltar para login</Link>
          </section>
        </main>
      ) : <VocalRangeTestV3 profileId={profileId} authUserId={user?.id || (profile as any)?.auth_user_id || null} initialProfile={vocalProfile} />}
    </AppShell>
  );
}
