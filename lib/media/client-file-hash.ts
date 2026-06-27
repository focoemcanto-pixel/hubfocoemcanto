export async function sha256File(file: File) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
