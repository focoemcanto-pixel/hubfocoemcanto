import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Row = any;

function publicR2Base() {
  return String(process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/$/, '');
}

function isRealR2Url(value?: string | null) {
  const url = String(value || '').trim();
  const base = publicR2Base();
  if (!url || !base) return false;
  return url.startsWith(`${base}/`);
}

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const productId = url.searchParams.get('productId');
    if (!productId) return NextResponse.json({ error: 'missing_product_id' }, { status: 400 });

    const supabase = createAdminClient();
    const [{ data: product }, { data: course }] = await Promise.all([
      supabase.from('products').select('id,name,slug').eq('id', productId).maybeSingle(),
      supabase.from('courses').select('id').eq('product_id', productId).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ]);

    if (!product) return NextResponse.json({ error: 'product_not_found' }, { status: 404 });

    const { data: links } = course?.id
      ? await supabase.from('course_module_links').select('module_id,sort_order').eq('course_id', course.id).order('sort_order', { ascending: true })
      : { data: [] };

    const moduleIds = ((links || []) as Row[]).map((link) => String(link.module_id));
    if (!moduleIds.length) return NextResponse.json({ product, r2Base: publicR2Base(), total: 0, migrated: 0, pending: 0, modules: [] });

    const { data: modules } = await supabase
      .from('modules')
      .select('id,title,slug,sort_order,exercises(id,title,slug,media_url,drive_url)')
      .in('id', moduleIds)
      .order('sort_order', { ascending: true });

    const linkOrder = new Map(((links || []) as Row[]).map((link) => [String(link.module_id), Number(link.sort_order || 0)]));
    const summaries = ((modules || []) as Row[])
      .sort((a, b) => (linkOrder.get(String(a.id)) || Number(a.sort_order || 0)) - (linkOrder.get(String(b.id)) || Number(b.sort_order || 0)))
      .map((module) => {
        const lessons = (module.exercises || []) as Row[];
        const total = lessons.length;
        const migrated = lessons.filter((lesson) => isRealR2Url(lesson.media_url)).length;
        const pending = lessons.filter((lesson) => lesson.drive_url && !isRealR2Url(lesson.media_url)).length;
        const examples = lessons.slice(0, 8).map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          slug: lesson.slug,
          status: isRealR2Url(lesson.media_url) ? 'r2' : lesson.drive_url ? 'drive' : 'empty',
        }));
        return { id: module.id, title: module.title || 'Módulo sem nome', slug: module.slug, total, migrated, pending, examples };
      });

    const total = summaries.reduce((sum, item) => sum + item.total, 0);
    const migrated = summaries.reduce((sum, item) => sum + item.migrated, 0);
    const pending = summaries.reduce((sum, item) => sum + item.pending, 0);

    return NextResponse.json({ product, r2Base: publicR2Base(), total, migrated, pending, modules: summaries });
  } catch (error) {
    return NextResponse.json({ error: 'migration_status_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
