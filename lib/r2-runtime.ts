export function normalizeRuntimeUrl(value?: string | null) {
  const trimmed = String(value || '').trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeR2RuntimeEnv() {
  const endpoint = process.env.R2_ENDPOINT;
  const publicUrl = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  if (endpoint) process.env.R2_ENDPOINT = normalizeRuntimeUrl(endpoint);
  if (publicUrl) {
    process.env.R2_PUBLIC_URL = normalizeRuntimeUrl(publicUrl);
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL = normalizeRuntimeUrl(publicUrl);
  }
}
