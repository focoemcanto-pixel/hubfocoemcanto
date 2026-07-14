import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const offerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  headline: z.string().trim().max(180).optional().or(z.literal('')),
  description: z.string().trim().max(700).optional().or(z.literal('')),
  price: z.string().trim().max(80).optional().or(z.literal('')),
  oldPrice: z.string().trim().max(80).optional().or(z.literal('')),
  checkoutUrl: z.string().trim().url(),
  ctaLabel: z.string().trim().min(2).max(80).default('Quero garantir minha vaga'),
  imageUrl: z.string().trim().url().optional().or(z.literal('')),
  badge: z.string().trim().max(80).optional().or(z.literal('')),
});

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('live_offers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ offers: data || [] });
}

export async function POST(request: NextRequest) {
  try {
    const input = offerSchema.parse(await request.json());
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('live_offers')
      .insert({
        name: input.name,
        headline: input.headline || null,
        description: input.description || null,
        price: input.price || null,
        old_price: input.oldPrice || null,
        checkout_url: input.checkoutUrl,
        cta_label: input.ctaLabel,
        image_url: input.imageUrl || null,
        badge: input.badge || 'Oferta especial',
      })
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ offer: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível salvar a oferta.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
