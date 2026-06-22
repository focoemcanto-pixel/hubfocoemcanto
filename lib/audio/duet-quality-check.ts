export type DuetQualityCheck = {
  ok: boolean;
  reason?: string;
  duration?: number;
  hasVideo?: boolean;
};

export async function validateDuetVideoBlob(blob: Blob): Promise<DuetQualityCheck> {
  if (!blob || blob.size < 8000) return { ok: false, reason: 'Arquivo de vídeo vazio ou corrompido.' };

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('timeout')), 10000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('invalid_video'));
      };
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const hasVideo = video.videoWidth > 0 && video.videoHeight > 0;
    if (!duration || duration < 0.6 || !hasVideo) return { ok: false, reason: 'O vídeo renderizado não ficou válido. Grave novamente.', duration, hasVideo };
    return { ok: true, duration, hasVideo };
  } catch {
    return { ok: false, reason: 'Não consegui validar o vídeo final. Tente renderizar de novo.' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
