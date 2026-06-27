import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type QueuePayload = {
  productId?: string;
  fileKey?: string;
  fileName?: string;
  relativePath?: string;
  fileSize?: number;
  fileType?: string;
  status?: string;
  progress?: number;
  streamUid?: string;
  uploadUrl?: string;
  attempts?: number;
  lastError?: string;
  matchedExerciseId?: string | null;
  matchedExerciseTitle?: string | null;
  raw?: Record<string, unknown>;
};

const ACTIVE_STATUSES = ['queued', 'creating', 'uploading', 'saving', 'error'];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = url.searchParams.get('productId') || '';
  if (!productId) return NextResponse.json({ error: 'missing_product_id' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stream_upload_queue')
    .select('*')
    .eq('product_id', productId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: 'queue_fetch_failed', message: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as QueuePayload;
    const productId = String(body.productId || '').trim();
    const fileKey = String(body.fileKey || '').trim();
    const fileName = String(body.fileName || '').trim();
    if (!productId || !fileKey || !fileName) return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });

    const supabase = createAdminClient();
    const payload = {
      product_id: productId,
      file_key: fileKey,
      file_name: fileName,
      relative_path: body.relativePath || fileName,
      file_size: body.fileSize || null,
      file_type: body.fileType || null,
      status: body.status || 'queued',
      progress: Math.max(0, Math.min(100, Number(body.progress || 0))),
      stream_uid: body.streamUid || null,
      upload_url: body.uploadUrl || null,
      attempts: Math.max(0, Number(body.attempts || 0)),
      last_error: body.lastError || null,
      matched_exercise_id: body.matchedExerciseId || null,
      matched_exercise_title: body.matchedExerciseTitle || null,
      raw: body.raw || {},
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase.from('stream_upload_queue').select('id').eq('product_id', productId).eq('file_key', fileKey).maybeSingle();
    if (existing?.id) {
      const { data, error } = await supabase.from('stream_upload_queue').update(payload).eq('id', existing.id).select('*').single();
      if (error) return NextResponse.json({ error: 'queue_update_failed', message: error.message }, { status: 500 });
      return NextResponse.json({ item: data });
    }

    const { data, error } = await supabase.from('stream_upload_queue').insert(payload).select('*').single();
    if (error) return NextResponse.json({ error: 'queue_insert_failed', message: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (error) {
    return NextResponse.json({ error: 'queue_save_error', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as QueuePayload;
    const productId = String(body.productId || '').trim();
    const fileKey = String(body.fileKey || '').trim();
    if (!productId || !fileKey) return NextResponse.json({ error: 'missing_queue_key' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) patch.status = body.status;
    if (typeof body.progress === 'number') patch.progress = Math.max(0, Math.min(100, body.progress));
    if (typeof body.streamUid === 'string') patch.stream_uid = body.streamUid || null;
    if (typeof body.uploadUrl === 'string') patch.upload_url = body.uploadUrl || null;
    if (typeof body.attempts === 'number') patch.attempts = Math.max(0, body.attempts);
    if (typeof body.lastError === 'string') patch.last_error = body.lastError || null;
    if (typeof body.matchedExerciseId !== 'undefined') patch.matched_exercise_id = body.matchedExerciseId || null;
    if (typeof body.matchedExerciseTitle !== 'undefined') patch.matched_exercise_title = body.matchedExerciseTitle || null;
    if (body.raw) patch.raw = body.raw;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('stream_upload_queue')
      .update(patch)
      .eq('product_id', productId)
      .eq('file_key', fileKey)
      .select('*')
      .maybeSingle();

    if (error) return NextResponse.json({ error: 'queue_patch_failed', message: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (error) {
    return NextResponse.json({ error: 'queue_patch_error', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
