export function estimateDuetLatencyMs(label?: string | null) {
  const normalized = (label || '').toLowerCase();
  if (/airpods|bluetooth|headset|headphone|fone|hands-free|handsfree|earbuds|buds|wh-/.test(normalized)) return 155;
  if (/iphone|ipad|android|phone|celular|built.?in|internal|microfone interno/.test(normalized)) return 70;
  return 55;
}

export function clampLatencyMs(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(280, Math.round(value)));
}
