import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const optionalUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim() ? normalizeUrl(value) : value,
  z.string().url().nullable().optional(),
);

const offerPayload = z.object({
  id: z.string().uuid(),
  name: z.string(),
  headline: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  old_price: z.string().nullable().optional(),
  checkout_url: z.preprocess((value) => typeof value === 'string' ? normalizeUrl(value) : value, z.string().url()),
  cta_label: z.string().nullable().optional(),
  image_url: optionalUrl,
  badge: z.string().nullable().optional(),
});

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('scene'), scene: z.enum(['waiting', 'class', 'screen', 'offer', 'notice']) }),
  z.object({
    action: z.literal('offer'),
    mode: z.enum(['split', 'banner', 'floating', 'hidden']),
    offer: offerPayload.nullable(),
    participantCount: z.number().int().min(0).max(10000).optional(),
  }),
]);

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const accessEmail = request.cookies.get('hub_access_email')?.value;
    if (!accessEmail) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

    const { slug } = await context.params;
    const input = schema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: live, error } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !live) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.action === 'start') {
      if (live.status === 'ended') {
        return NextResponse.json({ error: 'Esta aula já foi encerrada. Crie uma nova transmissão para iniciar outra aula.' }, { status: 409 });
      }
      if (!['draft', 'scheduled', 'live'].includes(live.status)) {
        return NextResponse.json({ error: 'Esta transmissão não pode ser iniciada.' }, { status: 409 });
      }
      patch.status = 'live';
      patch.current_scene = 'class';
      patch.ends_at = null;
      patch.offer_config = {};
    }

    if (input.action === 'end') {
      if (live.status !== 'live') {
        return NextResponse.json({ error: 'A transmissão não está ao vivo.' }, { status: 409 });
      }
      patch.status = 'ended';
      patch.ends_at = new Date().toISOString();
      patch.current_scene = 'waiting';
      patch.offer_config = {};
      patch.waiting_room_locked = true;
    }

    if (input.action === 'scene') {
      if (live.status !== 'live') {
        return NextResponse.json({ error: 'Inicie a transmissão antes de trocar a cena.' }, { status: 409 });
      }
      patch.current_scene = input.scene;
    }

    if (input.action === 'offer') {
      if (live.status !== 'live') {
        return NextResponse.json({ error: 'Inicie a transmissão antes de exibir uma oferta.' }, { status: 409 });
      }

      const visible = input.mode !== 'hidden' && Boolean(input.offer);
      patch.offer_config = visible
        ? { offer: input.offer, mode: input.mode, displayed_at: new Date().toISOString() }
        : {};
      patch.current_scene = input.mode === 'split' ? 'offer' : live.current_scene === 'offer' ? 'class' : live.current_scene;

      const { error: eventError } = await supabase.from('live_offer_events').insert({
        live_session_id: live.id,
        offer_id: input.offer?.id || null,
        event_type: visible ? 'display' : 'hide',
        display_mode: input.mode,
        participant_count: input.participantCount ?? null,
        metadata: { controlled_by: accessEmail },
      });

      if (eventError && eventError.code !== '42P01') throw eventError;
    }

    const { data: updated, error: updateError } = await supabase
      .from('live_sessions')
      .update(patch)
      .eq('id', live.id)
      .select('id,status,current_scene,offer_config,ends_at')
      .single();

    if (updateError) throw updateError;
    return NextResponse.json({ live: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Confira os dados da oferta e tente novamente.' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Não foi possível controlar a live.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
