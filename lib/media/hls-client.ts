export function isHlsUrl(url: string) {
  return /\.m3u8(\?|#|$)/i.test(url);
}

export function canPlayNativeHls(media: HTMLMediaElement) {
  return Boolean(media.canPlayType('application/vnd.apple.mpegurl') || media.canPlayType('application/x-mpegURL'));
}

export async function attachMediaSource(media: HTMLMediaElement, url: string) {
  const source = String(url || '').trim();
  if (!source) throw new Error('missing_media_source');

  media.crossOrigin = 'anonymous';
  media.preload = 'auto';
  if ('playsInline' in media) (media as HTMLVideoElement).playsInline = true;

  if (!isHlsUrl(source) || canPlayNativeHls(media)) {
    media.src = source;
    media.load();
    return { destroy: () => undefined };
  }

  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) {
    media.src = source;
    media.load();
    return { destroy: () => undefined };
  }

  const hls = new Hls({
    capLevelToPlayerSize: true,
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 30,
    maxMaxBufferLength: 90,
    startLevel: -1,
    xhrSetup: (xhr) => {
      xhr.withCredentials = false;
    },
  });
  hls.loadSource(source);
  hls.attachMedia(media);
  return { destroy: () => hls.destroy() };
}
