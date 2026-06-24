import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { midiToNoteName, midiToFrequency } from '@/lib/audio/pitch';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.profileId) return NextResponse.json({ error: 'profileId obrigatório' }, { status: 400 });
    const lowest = body.lowest;
    const highest = body.highest;
    const tessLow = Number(body.tessituraLowMidi);
    const tessHigh = Number(body.tessituraHighMidi);
    if (!lowest || !highest || lowest.midi > highest.midi || tessLow < lowest.midi || tessHigh > highest.midi || tessLow > tessHigh) {
      return NextResponse.json({ error: 'Dados vocais inconsistentes' }, { status: 400 });
    }
    const admin = createAdminClient();
    const payload = {
      profile_id: body.profileId,
      auth_user_id: body.authUserId || null,
      lowest_note: lowest.note,
      lowest_midi: lowest.midi,
      lowest_frequency: lowest.frequency,
      highest_note: highest.note,
      highest_midi: highest.midi,
      highest_frequency: highest.frequency,
      tessitura_low_note: midiToNoteName(tessLow),
      tessitura_low_midi: tessLow,
      tessitura_high_note: midiToNoteName(tessHigh),
      tessitura_high_midi: tessHigh,
      classification: body.classification || 'Indefinida',
      classification_confidence: body.confidence || 0.55,
      gender: body.gender || 'nao_informar',
      test_status: 'completed',
      raw_data: {
        capturedLowest: lowest,
        capturedHighest: highest,
        tessituraSteps: body.tessituraSteps || [],
        userAgent: body.userAgent || null,
        referenceFrequencies: { tessituraLow: midiToFrequency(tessLow), tessituraHigh: midiToFrequency(tessHigh) },
        completedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from('vocal_profiles').upsert(payload, { onConflict: 'profile_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro inesperado' }, { status: 500 });
  }
}
