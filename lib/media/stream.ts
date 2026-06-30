function streamUid(value: string) {
  const clean = value.trim();
  if (!clean) return '';
  if (!clean.startsWith('http')) return clean;
  try {
    const parsed = new URL(clean);
    return parsed.pathname.split('/').filter(Boolean)[0] || '';
  } catch {
    return clean;
  }
}

export function cloudflareStreamSource(uid?: string | null) {
  const value = streamUid(String(uid || ''));
  if (!value) return '';
  return `https://videodelivery.net/${value}/manifest/video.m3u8`;
}

export function cloudflareStreamEmbed(uid?: string | null) {
  const value = streamUid(String(uid || ''));
  if (!value) return '';
  return `https://videodelivery.net/${value}/iframe`;
}
