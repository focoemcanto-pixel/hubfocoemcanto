import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: {
      medium?: { url?: string };
      high?: { url?: string };
      default?: { url?: string };
    };
  };
};

function cleanQuery(value: string | null) {
  return (value || '').trim().slice(0, 120);
}

export async function GET(request: Request) {
  const query = cleanQuery(new URL(request.url).searchParams.get('q'));
  if (!query) return NextResponse.json({ ok: false, message: 'Digite o nome da música para pesquisar.' }, { status: 400 });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, message: 'YOUTUBE_API_KEY não configurada no ambiente.' }, { status: 500 });

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    key: apiKey,
    type: 'video',
    videoEmbeddable: 'true',
    safeSearch: 'none',
    maxResults: '8',
  });

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { next: { revalidate: 300 } });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json({ ok: false, message: 'Não foi possível pesquisar no YouTube agora.', details: data?.error?.message || null }, { status: response.status });
  }

  const items = ((data?.items || []) as YouTubeSearchItem[])
    .map((item) => {
      const videoId = item.id?.videoId || '';
      const thumbnail = item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';
      return {
        videoId,
        title: item.snippet?.title || 'Vídeo sem título',
        channelTitle: item.snippet?.channelTitle || 'Canal não informado',
        thumbnail,
        publishedAt: item.snippet?.publishedAt || null,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
      };
    })
    .filter((item) => item.videoId);

  return NextResponse.json({ ok: true, items });
}
