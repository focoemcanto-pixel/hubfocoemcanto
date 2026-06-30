import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle } from '@/lib/media/cloudflare-stream';
import { AdminStreamImportForm } from '@/components/admin-stream-import-form';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type StreamVideo = { uid?: string; name?: string; duration?: number; thumbnail?: string; status?: { state?: string; errorReasonCode?: string | null; errorReasonText?: string | null }; meta?: Record<string, unknown> };

async function listStreamVideos() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const token = process.env.CLOUDFLARE_STREAM_TOKEN || '';
  if (!accountId || !token) return { videos: [] as StreamVideo[], error: 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.' };
  const videosByUid = new Map<string, StreamVideo>();
  let previousFirstUid = '';
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?per_page=100&page=${page}&asc=false`, {
      headers: { authorization: ['Bearer', token].join(' ') },
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) return { videos: [...videosByUid.values()], error: json?.errors?.[0]?.message || `Cloudflare Stream respondeu ${response.status}.` };
    const batch = Array.isArray(json?.result) ? json.result : [];
    const firstUid = String(batch[0]?.uid || '');
    if (page > 1 && firstUid && firstUid === previousFirstUid) break;
    previousFirstUid = firstUid;
    for (const video of batch) {
      const uid = String(video?.uid || '').trim();
      if (uid) videosByUid.set(uid, video);
    }
    const info = json?.result_info;
    if (!batch.length || (info?.total_pages && page >= Number(info.total_pages)) || (info?.count && Number(info.count) < 100)) break;
  }
  return { videos: [...videosByUid.values()], error: '' };
}

function videoName(video: StreamVideo) { return String(video.meta?.name || video.name || video.uid || 'Vídeo sem nome'); }
function cleanTitle(name: string) { return name.replace(/\.[^/.]+$/, '').trim(); }
function score(a: string, b: string) { if (!a || !b) return 0; if (a === b) return 100; if (a.includes(b) || b.includes(a)) return Math.min(98, Math.round((Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 100) + 18); const aw = new Set(a.split(/\s+/).filter(Boolean)); const bw = new Set(b.split(/\s+/).filter(Boolean)); const common = [...aw].filter((word) => bw.has(word)).length; return Math.round((common / (new Set([...aw, ...bw]).size || 1)) * 100); }
function validStreamVideo(video: StreamVideo) { return Boolean(String(video.uid || '').trim()) && String(video.status?.state || '') === 'ready' && !video.status?.errorReasonCode && (Number(video.duration || 0) || 0) > 0; }

export default async function SelectStreamPage({ searchParams }: { searchParams: Promise<{ module?: string; q?: string; imported?: string }> }) {
  const params = await searchParams;
  const moduleId = String(params.module || '').trim();
  const q = String(params.q || '').trim();
  const supabase = createAdminClient();

  if (!moduleId) {
    const { data: modules } = await supabase.from('modules').select('id,title,description').eq('is_active', true).order('sort_order', { ascending: true });
    return (
      <main className="admin-page-clean">
        <section className="admin-clean-hero"><div><span className="admin-clean-eyebrow">Cloudflare Stream</span><h1>Escolha um módulo</h1><p>Selecione um módulo para importar vídeos do Stream como aulas.</p></div><a className="admin-clean-button secondary" href="/admin/produtos">Voltar</a></section>
        <section className="admin-clean-section"><div className="admin-list">{(modules || []).map((module: any) => <div className="admin-row" key={module.id}><div><h3>{module.title}</h3><p className="muted">Importar aulas do Stream para este módulo.</p></div><a className="admin-clean-button secondary" href={`/admin/conteudos/selecionar-stream?module=${module.id}`}>Abrir Stream</a></div>)}</div></section>
      </main>
    );
  }

  const [{ data: module }, { data: exercises }, stream] = await Promise.all([
    supabase.from('modules').select('id,title').eq('id', moduleId).maybeSingle(),
    supabase.from('exercises').select('id,title,slug,stream_uid').eq('module_id', moduleId).limit(1000),
    listStreamVideos(),
  ]);
  const { data: courseLink } = await supabase.from('course_module_links').select('course_id').eq('module_id', moduleId).limit(1).maybeSingle();
  const { data: course } = courseLink?.course_id ? await supabase.from('courses').select('product_id').eq('id', courseLink.course_id).maybeSingle() : { data: null as any };
  const productId = course?.product_id || '';

  const usedUids = new Set((exercises || []).map((item: any) => String(item.stream_uid || '').trim()).filter(Boolean));
  const lessonNames = (exercises || []).map((lesson: any) => ({ title: lesson.title || lesson.slug || '', normalized: normalizeMediaTitle(lesson.title || lesson.slug || '') }));
  const seen = new Set<string>();
  const videos = (stream.videos || [])
    .filter(validStreamVideo)
    .filter((video) => {
      const uid = String(video.uid || '').trim();
      if (!uid || seen.has(uid)) return false;
      seen.add(uid);
      return true;
    })
    .map((video) => {
      const name = videoName(video);
      const title = cleanTitle(name);
      const normalized = normalizeMediaTitle(title);
      const best = lessonNames.map((lesson) => ({ ...lesson, score: score(normalized, lesson.normalized) })).sort((a, b) => b.score - a.score)[0];
      const uid = String(video.uid);
      return { uid, name, title, duration: Number(video.duration || 0) || null, matchTitle: best?.score >= 62 ? best.title : '', imported: usedUids.has(uid) };
    })
    .filter((video) => !q || video.name.toLowerCase().includes(q.toLowerCase()) || video.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(a.imported) - Number(b.imported) || a.title.localeCompare(b.title));
  const availableCount = videos.filter((video) => !video.imported).length;
  const importedCount = videos.filter((video) => video.imported).length;
  const importedMessage = Number(params.imported || 0) || 0;

  return (
    <main className="admin-page-clean">
      <section className="admin-clean-hero">
        <div><span className="admin-clean-eyebrow">Importar para: {module?.title || 'Módulo'}</span><h1>Cloudflare Stream</h1><p>Selecione os vídeos já enviados no Cloudflare e importe como aulas deste módulo.</p></div>
        <a className="admin-clean-button secondary" href={productId ? `/admin/produtos/${productId}` : '/admin/produtos'}>Voltar</a>
      </section>
      <section className="admin-product-tabs"><a href={productId ? `/admin/produtos/${productId}` : '/admin/produtos'}>Módulo</a><a href={`/admin/conteudos/selecionar-drive?module=${moduleId}`}>Meu Drive</a><a className="active" href={`/admin/conteudos/selecionar-stream?module=${moduleId}`}>Stream</a></section>
      <section className="admin-clean-section">
        <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Vídeos prontos</span><h2>Importar para {module?.title}</h2><p className="admin-clean-muted">Marque os vídeos desejados e importe em massa. Os já importados ficam sinalizados.</p></div><strong>{availableCount} livres · {importedCount} importados</strong></div>
        <form className="admin-clean-form" action="/admin/conteudos/selecionar-stream"><input type="hidden" name="module" value={moduleId} /><label>Buscar no Stream<input name="q" defaultValue={q} placeholder="Nome do vídeo..." /></label><button className="admin-clean-button secondary" type="submit">Buscar</button></form>
        {importedMessage ? <p className="admin-save-success">{importedMessage} vídeo(s) importado(s) com sucesso.</p> : null}
        {stream.error ? <p className="admin-save-error">{stream.error}</p> : null}
        <AdminStreamImportForm moduleId={moduleId} productId={productId} videos={videos} />
      </section>
    </main>
  );
}
