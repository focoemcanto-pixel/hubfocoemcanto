import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const payloadSchema = z.object({
  gender: z.enum(['male', 'female', 'unknown']).default('unknown'),
  lowest_note: z.string().min(1),
  highest_note: z.string().min(1),
  lowest_midi: z.number().int(),
  highest_midi: z.number().int(),
  comfortable_low_note: z.string().min(1),
  comfortable_high_note: z.string().min(1),
  comfortable_low_midi: z.number().int(),
  comfortable_high_midi: z.number().int(),
  voice_type: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const cookieStore = await cookies();
  const { data: { user } } = await supabase.auth.getUser();
  const accessEmail = cookieStore.get('hub_access_email')?.value || user?.email || '';
  const body = payloadSchema.safeParse(await request.json());

  if (!body.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  if (!accessEmail && !user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile } = accessEmail
    ? await admin.from('profiles').select('id').eq('email', accessEmail).maybeSingle()
    : await admin.from('profiles').select('id').eq('auth_user_id', user!.id).maybeSingle();

  if (!profile?.id) return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });

  const { data, error } = await admin.from('vocal_profiles').insert({
    profile_id: profile.id,
    ...body.data,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
