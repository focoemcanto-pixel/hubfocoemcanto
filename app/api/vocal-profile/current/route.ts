import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const PROFILE_SELECT = 'id,name,email,auth_user_id';
const VOCAL_PROFILE_SELECT = 'classification,classification_confidence,lowest_note,highest_note,tessitura_low_note,tessitura_high_note,updated_at';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const cookieStore = await cookies();
    const { data: { user } } = await supabase.auth.getUser();
    const accessEmail = cookieStore.get('hub_access_email')?.value || user?.email || '';

    const { data: profile } = accessEmail
      ? await admin.from('profiles').select(PROFILE_SELECT).eq('email', accessEmail).maybeSingle()
      : user
        ? await admin.from('profiles').select(PROFILE_SELECT).eq('auth_user_id', user.id).maybeSingle()
        : { data: null };

    const profileId = (profile as any)?.id;
    const authUserId = user?.id || (profile as any)?.auth_user_id || null;

    if (!profileId && !authUserId) {
      return NextResponse.json({ vocalProfile: null, error: 'Perfil não encontrado' }, { status: 404 });
    }

    let query = admin.from('vocal_profiles').select(VOCAL_PROFILE_SELECT).order('updated_at', { ascending: false }).limit(1);
    if (profileId && authUserId) query = query.or(`profile_id.eq.${profileId},auth_user_id.eq.${authUserId}`);
    else if (profileId) query = query.eq('profile_id', profileId);
    else query = query.eq('auth_user_id', authUserId);

    const { data, error } = await query.maybeSingle();
    if (error) return NextResponse.json({ vocalProfile: null, error: error.message }, { status: 500 });

    return NextResponse.json({ vocalProfile: data || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ vocalProfile: null, error: error?.message || 'Erro inesperado' }, { status: 500 });
  }
}
