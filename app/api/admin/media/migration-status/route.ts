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

function isVipProduct(product: Row) {
  const slug = String(product?.slug || '').toLowerCase();
  const name = String(product?.name || '').toLowerCase();
  return slug.includes('grupo-vip') || name.includes('grupo vip') || name.includes('vip');
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

    const linkedIds = ((links || []) as Row[]).map((link) => String(link.module_id));
    const linkOrder = new Map(((links || []) as Row[]).map((link) => [String(link.module_id), Number(link.sort_order || 0)]));

    const moduleQuery = supabase
      .from('modules')
      .select('id,title,slug,description,sort_order,is_active,exercises(id,title,slug,media_url,drive_url,media_type,sort_order)')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    const { data: modulesData } = linkedIds.length ? await moduleQuery.in('id', linkedIds) : await moduleQuery;

    const modulesSource = ((modulesData || []) as Row[])
      .filter((module) => module.is_active !== false)
      .filter((module) => !String(module.description || '').toLowerCase().includes('importados da pasta'));

    const modules = linkedIds.length || isVipProduct(product)
      ? modulesSource
      : [];

    const summaries = modules
      .sort((a, b) => (linkOrder.get(String(a.id)) || Number(a.sort_order || 0)) - (linkOrder.get(String(b.id)) || Number(b.sort_order || 0)))
      .map((module) => {
        const lessons = ((module.exercises || []) as Row[]).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
        const lessonRows = lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          slug: lesson.slug,
          mediaType: lesson.media_type,
          driveUrl: lesson.drive_url,
          mediaUrl: lesson.media_url,
          status: isRealR2Url(lesson.media_url) ? 'r2' : lesson.drive_url ? 'drive' : 'empty',
        }));
        const total = lessonRows.length;
        const migrated = lessonRows.filter((lesson) => lesson.status === 'r2').length;
        const pending = lessonRows.filter((lesson) => lesson.status === 'drive').length;
        return { id: module.id, title: module.title || 'Módulo sem nome', slug: module.slug, total, migrated, pending, lessons: lessonRows };
      });

    const total = summaries.reduce((sum, item) => sum + item.total, 0);
    const migrated = summaries.reduce((sum, item) => sum + item.migrated, 0);
    const pending = summaries.reduce((sum, item) => sum + item.pending, 0);

    return NextResponse.json({ product, r2Base: publicR2Base(), total, migrated, pending, modules: summaries });
  } catch (error) {
    return NextResponse.json({ error: 'migration_status_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
