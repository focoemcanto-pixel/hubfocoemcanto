export async function videoFileToPoster(file: File): Promise<File | null> {
  if (!file.type.startsWith('video/')) return null;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('poster_timeout')), 4500);
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(0.35, Math.max(0, (video.duration || 1) * 0.08));
      };
      video.onseeked = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('poster_error'));
      };
      video.load();
    });

    const sourceWidth = video.videoWidth || 720;
    const sourceHeight = video.videoHeight || 1280;
    const scale = Math.min(1, 720 / Math.max(1, sourceWidth));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.74));
    if (!blob || blob.size < 300) return null;
    return new File([blob], 'duet-poster.jpg', { type: 'image/jpeg' });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function inferredPosterUrl(mediaUrl?: string | null) {
  if (!mediaUrl) return '';
  return mediaUrl.replace(/\.(webm|mp4)(\?.*)?$/i, '-poster.jpg$2');
}
