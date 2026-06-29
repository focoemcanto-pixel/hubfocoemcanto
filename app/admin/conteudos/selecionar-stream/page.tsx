import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type StreamVideo = {
  uid?: string;
  name?: string;
  duration?: number;
  thumbnail?: string;
  status?: { state?: string };
  meta?: Record<string, unknown>;
};

function streamConfig() {
  return { accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '', token: process.env.CLOUDFLARE_STREAM_TOKEN || '' };
}

async function listStreamVideos() {
  const { accountId, token } = streamConfig();
  if (!accountId || !token) return { videos: [] as StreamVideo[], error: 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.' };
  const videos: StreamVideo[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?per_page=100&page=${page}`, {
      headers: { authorization: ['Bearer', token].join(' ') },
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) return { videos, error: json?.errors?.[0]?.message || `Cloudflare Stream respondeu ${response.status}.` };
    const batch = Array.isArray(json?.result) ? json.result : [];
    videos.push(...batch);
    const info = json?.result_info;
    if (!batch.length || (info?.total_pages && page >= Number(info.total_pages))) break;
  }
  return { videos, error: '' };
}

function videoName(video: StreamVideo) {
  return String(video.meta?.name || video.name || video.uid || 'Vídeo sem nome');
}

function cleanTitle(name: string) {
  return name.replace(/\.[^/.]+$/, '').trim();
}

function time(seconds?: number | null) {
  if (!seconds) return '—';
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function score(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return Math.min(98, Math.round((Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 100) + 18);
  const aw = new Set(a.split(/\s+/).filter(Boolean));
  const bw = new Set(b.split(/\s+/).filter(Boolean));
  const common = [...aw].filter((word) => bw.has(word)).length;
  return Math.round((common / (new Set([...aw, ...bw]).size || 1)) * 100);
}

export default async function SelectStreamPage({ searchParams }: { searchParams: Promise<{ module?: string; q?: string }> }) {
  const params = await searchParams;
  const selectedModuleId = String(params.module || '').trim();
  const q = String(params.q || '').trim();
  const supabase = createAdminClient();

  if (!selectedModuleId) {
    const { data: modules } = await supabase.from('modules').select('id,title,description').order('sort_order');
    const visibleModules = (modules || []).filter((module: any) => String(module.description || '').toLowerCase().indexOf('importados da pasta') === -1);
    return (
      <main className="page admin-shell">
        <section className="admin-hero">
          <div><p className="eyebrow">Stream bloqueado</p><h1>Escolha um módulo primeiro</h1><p className="muted">O Stream importa vídeos diretamente para um módulo já criado.</p></div>
          <a className="button secondary" href="/admin/produtos">Voltar</a>
        </section>
        <section className="card admin-section">
          <p className="eyebrow">Módulos</p><h2>Selecione onde deseja importar</h2>
          <div className="admin-list">{visibleModules.map((module: any) => <div className="admin-row" key={module.id}><div><h3>{module.title}</h3><p className="muted">Importar vídeos do Cloudflare Stream para este módulo.</p></div><a className="button secondary" href={`/admin/conteudos/selecionar-stream?module=${module.id}`}>Selecionar Stream</a></div>)}</div>
        </section>
      </main>
    );
  }

  const [{ data: module }, { data: exercises }, stream] = await Promise.all([
    supabase.from('modules').select('id,title').eq('id', selectedModuleId).single(),
    supabase.from('exercises').select('id,title,slug,stream_uid').eq('module_id', selectedModuleId).limit(1000),
    listStreamVideos(),
  ]);

  const usedUids = new Set((exercises || []).map((item: any) => String(item.stream_uid || '').trim()).filter(Boolean));
  const normalizedLessons = (exercises || []).map((lesson: any) => ({ id: lesson.id, title: lesson.title, normalized: normalizeMediaTitle(lesson.title || lesson.slug || '') }));
  const videos = (stream.videos || [])
    .filter((video) => String(video.status?.state || '') === 'ready')
    .filter((video) => video.uid && !usedUids.has(String(video.uid)))
    .map((video) => {
      const name = videoName(video);
      const normalized = normalizeMediaTitle(cleanTitle(name));
      const best = normalizedLessons.map((lesson: any) => ({ ...lesson, score: score(normalized, lesson.normalized) })).sort((a: any, b: any) => b.score - a.score)[0];
      return { uid: String(video.uid), name, title: cleanTitle(name), duration: Number(video.duration || 0) || null, thumbnail: String(video.thumbnail || ''), score: best?.score || 0, matchTitle: best?.score >= 62 ? best.title : '' };
    })
    .filter((video) => !q || video.name.toLowerCase().includes(q.toLowerCase()) || video.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Importar Stream para: {module?.title || 'Módulo'}</p>
          <h1>Cloudflare Stream</h1>
          <p className="muted">Selecione vídeos já enviados no Cloudflare e importe como aulas deste módulo.</p>
        </div>
        <a className="button secondary" href={`/admin/biblioteca/${selectedModuleId}`}>Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href={`/admin/biblioteca/${selectedModuleId}`}>Módulo</a>
        <a href={`/admin/conteudos/selecionar-drive?module=${selectedModuleId}`}>Meu Drive</a>
        <a href={`/admin/conteudos/selecionar-stream?module=${selectedModuleId}`}>Stream</a>
      </nav>

      <section className="content-board admin-section">
        <article className="content-card">
          <p className="eyebrow">Destino fixo</p>
          <h2>{module?.title || 'Módulo'}</h2>
          <p className="muted">Tudo que você importar aqui será criado ou vinculado neste módulo.</p>
          <form action="/api/admin/media/stream-complete" method="post" className="admin-form">
            <input type="hidden" name="module_id" value={selectedModuleId} />
          </form>
        </article>
        <article className="content-card">
          <p className="eyebrow">Busca</p>
          <h2>Filtrar vídeos</h2>
          <form className="admin-form" action="/admin/conteudos/selecionar-stream">
            <input type="hidden" name="module" value={selectedModuleId} />
            <input name="q" defaultValue={q} placeholder="Nome do vídeo no Stream..." />
            <button className="button secondary" type="submit">Buscar</button>
          </form>
        </article>
      </section>

      {stream.error ? <section className="card admin-section"><h2>Não foi possível ler o Stream</h2><p className="muted">{stream.error}</p></section> : null}

      <section className="card admin-section">
        <div className="section-heading"><div><p className="eyebrow">Vídeos prontos</p><h2>Importar para {module?.title}</h2><p className="muted">Aparecem apenas vídeos Ready que ainda não estão vinculados neste módulo.</p></div><strong>{videos.length} vídeos</strong></div>
        <div className="admin-list">
          {videos.map((video) => (
            <div className="admin-row" key={video.uid}>
              <div>
                <span className="pill">Stream · {time(video.duration)}</span>
                <h3>{video.title}</h3>
                <p className="muted">{video.matchTitle ? `Provável aula: ${video.matchTitle} · ` : ''}UID {video.uid}</p>
              </div>
              <form action="/admin/stream/importar-video" method="post">
                <input type="hidden" name="module_id" value={selectedModuleId} />
                <input type="hidden" name="uid" value={video.uid} />
                <input type="hidden" name="name" value={video.name} />
                <button className="button secondary" type="submit">Importar</button>
              </form>
            </div>
          ))}
          {videos.length === 0 ? <p className="muted">Nenhum vídeo livre encontrado no Stream.</p> : null}
        </div>
      </section>
    </main>
  );
}
