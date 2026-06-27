export type CloudflareStreamVideo = {
  uid: string;
  name?: string | null;
  status?: {
    state?: string | null;
    pctComplete?: string | null;
    errorReasonCode?: string | null;
    errorReasonText?: string | null;
  } | null;
  duration?: number | null;
  size?: number | null;
  input?: { width?: number | null; height?: number | null; } | null;
  thumbnail?: string | null;
  preview?: string | null;
  playback?: {
    hls?: string | null;
    dash?: string | null;
  } | null;
};

const CUSTOMER_SUBDOMAIN = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN || process.env.CLOUDFLARE_STREAM_SUBDOMAIN || '';

export function streamIframeUrl(uid?: string | null) {
  if (!uid) return '';
  const host = CUSTOMER_SUBDOMAIN || 'iframe.videodelivery.net';
  return `https://${host}/${uid}/iframe`;
}

export function streamHlsUrl(uid?: string | null) {
  if (!uid) return '';
  const host = CUSTOMER_SUBDOMAIN || 'videodelivery.net';
  return `https://${host}/${uid}/manifest/video.m3u8`;
}

export function streamDashUrl(uid?: string | null) {
  if (!uid) return '';
  const host = CUSTOMER_SUBDOMAIN || 'videodelivery.net';
  return `https://${host}/${uid}/manifest/video.mpd`;
}

export function streamThumbnailUrl(uid?: string | null, time = '2s') {
  if (!uid) return '';
  const host = CUSTOMER_SUBDOMAIN || 'videodelivery.net';
  return `https://${host}/${uid}/thumbnails/thumbnail.jpg?time=${encodeURIComponent(time)}`;
}

export function normalizeMediaTitle(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.(mp4|mov|m4v|webm)$/i, '')
    .replace(/\s+-\s+af\s*firme.*$/i, '')
    .replace(/\s+-\s+ok$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
