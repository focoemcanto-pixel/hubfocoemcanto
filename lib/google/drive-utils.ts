export function driveRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/admin/google/callback`;
}

export function driveFolderId(input: string) {
  const folderMatch = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idMatch = input.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch?.[1]) return idMatch[1];
  return input.trim();
}

export function driveFileLink(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function mediaTypeFromFile(name: string, mimeType: string) {
  const lower = name.toLowerCase();
  if (mimeType.includes('audio') || lower.endsWith('.mp3') || lower.endsWith('.wav')) return 'audio';
  if (lower.includes('dueto')) return 'dueto';
  return 'video';
}
