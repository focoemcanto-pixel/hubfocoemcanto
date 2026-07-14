import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

const offerSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da oferta.').max(120),
  headline: optionalText(180),
  description: optionalText(700),
  price: optionalText(80),
  oldPrice: optionalText(80),
  checkoutUrl: z.string().trim().url('Informe um link de compra válido, começando com https://.'),
  ctaLabel: z.string().trim().min(2).max(80).default('Quero garantir minha vaga'),
  imageUrl: z.string().trim().url('A URL da imagem é inválida.').optional().or(z.literal('')),
  badge: optionalText(80),
});

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function databaseErrorResponse(error: SupabaseErrorLike) {
  const rawMessage = error.message || 'Não foi possível salvar a oferta.';
  const missingTable = error.code === '42P01' || rawMessage.includes('live_offers') && rawMessage.toLowerCase().includes('does not exist');

  if (missingTable) {
    return NextResponse.json(
      {
        error: 'A tabela de ofertas ainda não foi criada no Supabase. Execute a migration 20260714_create_live_offers.sql e tente novamente.',
        code: error.code,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      error: rawMessage,
      details: error.details || undefined,
      hint: error.hint || undefined,
      code: error.code || undefined,
    },
    { status: 400 },
  );
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('live_offers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return databaseErrorResponse(error);
  return NextResponse.json({ offers: data || [] });
}

export async function POST(request: NextRequest) {
  try {
    const parsed = offerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Revise os dados da oferta.' },
        { status: 400 },
      );
    }

    const input = parsed.data;
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
        cta_label: input.ctaLabel || 'Quero garantir minha vaga',
        image_url: input.imageUrl || null,
        badge: input.badge || 'Oferta especial',
      })
      .select('*')
      .single();

    if (error) return databaseErrorResponse(error);
    return NextResponse.json({ offer: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível processar a oferta.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
