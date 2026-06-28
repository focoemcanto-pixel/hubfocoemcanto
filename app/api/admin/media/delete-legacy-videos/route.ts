import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  productId?: string;
  moduleId?: string;
  dryRun?: boolean;
  confirm?: string;
};

type LegacyExercise = {
  id: string;
  title?: string | null;
  media_url?: string | null;
  stream_uid?: string | null;
};

type LegacyAsset = {
  id: string;
  title?: string | null;
  stream_uid?: string | null;
};

function blank(value: unknown) {
  return !String(value || '').trim();
}

function titleList(rows: Array<{ title?: string | null }>) {
  return rows.slice(0, 25).map((row) => row.title || 'Sem título');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handle({
    productId: url.searchParams.get('productId') || '',
    moduleId: url.searchParams.get('moduleId') || '',
    dryRun: true,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Body;
  return handle(body);
}

async function handle(body: Body) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const productId = String(body.productId || '').trim();
    const moduleId = String(body.moduleId || '').trim();
    const dryRun = body.dryRun !== false;
    const confirm = String(body.confirm || '').trim();

    if (!productId || !moduleId) {
      return NextResponse.json({ error: 'missing_destination', message: 'Informe produto e módulo.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const [{ data: product }, { data: module }] = await Promise.all([
      supabase.from('products').select('id,name').eq('id', productId).maybeSingle(),
      supabase.from('modules').select('id,title').eq('id', moduleId).maybeSingle(),
    ]);

    if (!product?.id || !module?.id) {
      return NextResponse.json({ error: 'invalid_destination', message: 'Produto ou módulo inválido.' }, { status: 400 });
    }

    const { data: rawExercises, error: exercisesError } = await supabase
      .from('exercises')
      .select('id,title,media_url,stream_uid')
      .eq('module_id', moduleId)
      .eq('media_type', 'video')
      .limit(5000);

    if (exercisesError) throw exercisesError;

    const legacyExercises = ((rawExercises || []) as LegacyExercise[]).filter((row) => blank(row.stream_uid));
    const legacyExerciseIds = legacyExercises.map((row) => row.id);

    const { data: rawAssets, error: assetsError } = await supabase
      .from('media_assets')
      .select('id,title,stream_uid')
      .eq('module_id', moduleId)
      .eq('media_type', 'video')
      .limit(5000);

    if (assetsError) throw assetsError;

    const legacyAssets = ((rawAssets || []) as LegacyAsset[]).filter((row) => blank(row.stream_uid));
    const legacyAssetIds = legacyAssets.map((row) => row.id);

    const payload = {
      productId,
      moduleId,
      productName: product.name || '',
      moduleTitle: module.title || '',
      dryRun,
      exercisesCount: legacyExerciseIds.length,
      mediaAssetsCount: legacyAssetIds.length,
      preview: {
        exercises: titleList(legacyExercises),
        mediaAssets: titleList(legacyAssets),
      },
    };

    if (dryRun) return NextResponse.json(payload);

    if (confirm !== 'DELETE_LEGACY_VIDEOS') {
      return NextResponse.json({
        ...payload,
        error: 'confirmation_required',
        message: 'Para excluir em massa, envie confirm: DELETE_LEGACY_VIDEOS.',
      }, { status: 400 });
    }

    let deletedMediaAssets = 0;
    let deletedExercises = 0;

    if (legacyAssetIds.length) {
      const { error } = await supabase.from('media_assets').delete().in('id', legacyAssetIds);
      if (error) throw error;
      deletedMediaAssets = legacyAssetIds.length;
    }

    if (legacyExerciseIds.length) {
      const { error } = await supabase.from('exercises').delete().in('id', legacyExerciseIds);
      if (error) throw error;
      deletedExercises = legacyExerciseIds.length;
    }

    return NextResponse.json({
      ...payload,
      deletedExercises,
      deletedMediaAssets,
      message: `${deletedExercises} aulas/vídeos sem Stream e ${deletedMediaAssets} mídias legadas removidas.`,
    });
  } catch (error) {
    return NextResponse.json({
      error: 'delete_legacy_videos_failed',
      message: error instanceof Error ? error.message : 'Erro ao excluir vídeos legados.',
    }, { status: 500 });
  }
}
