export function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

export function proxiedVideoUrl(url?: string | null) {
  if (!url) return '';
  if (url.startsWith('/api/media/drive/')) return url;
  if (url.startsWith('/api/drive/video/')) return url.replace('/api/drive/video/', '/api/media/drive/');
  const id = driveFileId(url);
  if (id) return `/api/media/drive/${id}`;
  return url;
}
