import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { midiToBrazilianNoteName, midiToFrequency, formatBrazilianNote } from '@/lib/audio/pitch';

export const dynamic = 'force-dynamic';

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
    const savedAt = new Date().toISOString();
    const payload = {
      profile_id: body.profileId,
      auth_user_id: body.authUserId || null,
      lowest_note: formatBrazilianNote(lowest.midi ?? lowest.note),
      lowest_midi: lowest.midi,
      lowest_frequency: lowest.frequency,
      highest_note: formatBrazilianNote(highest.midi ?? highest.note),
      highest_midi: highest.midi,
      highest_frequency: highest.frequency,
      tessitura_low_note: midiToBrazilianNoteName(tessLow),
      tessitura_low_midi: tessLow,
      tessitura_high_note: midiToBrazilianNoteName(tessHigh),
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
        completedAt: savedAt,
      },
      updated_at: savedAt,
    };
    const { data, error } = await admin
      .from('vocal_profiles')
      .upsert(payload, { onConflict: 'profile_id' })
      .select('classification,classification_confidence,lowest_note,highest_note,tessitura_low_note,tessitura_high_note,updated_at')
      .single();
    if (error) return NextResponse.json({ error: error.message || 'Erro ao salvar mapa vocal', code: error.code || null }, { status: 500 });
    const profile = data || {
      classification: payload.classification,
      classification_confidence: payload.classification_confidence,
      lowest_note: payload.lowest_note,
      highest_note: payload.highest_note,
      tessitura_low_note: payload.tessitura_low_note,
      tessitura_high_note: payload.tessitura_high_note,
      updated_at: payload.updated_at,
    };
    return NextResponse.json({ ok: true, profile, vocalProfile: profile }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro inesperado' }, { status: 500 });
  }
}
