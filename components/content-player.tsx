type ContentPlayerProps = {
  title?: string | null;
  mediaType?: string | null;
  driveUrl?: string | null;
  mediaUrl?: string | null;
};

function getDriveFileId(url?: string | null) {
  if (!url) return null;
  const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function isAllowedInternalMedia(url: string) {
  return url.startsWith('/api/media/drive/') || url.startsWith('/api/media/library/') || url.startsWith('/storage/v1/object/');
}

export function ContentPlayer({ title, mediaType, driveUrl, mediaUrl }: ContentPlayerProps) {
  const rawSource = driveUrl || mediaUrl || '';
  const driveFileId = getDriveFileId(rawSource);
  const type = mediaType || 'video';
  const source = driveFileId ? `/api/media/drive/${driveFileId}` : isAllowedInternalMedia(rawSource) ? rawSource : '';

  if (!source) {
    return (
      <div className="lesson-player empty-player">
        <strong>Material protegido</strong>
        <p className="muted">Este conteúdo só pode ser acessado pelo player interno do Hub.</p>
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div className="lesson-player">
        <audio controls controlsList="nodownload noplaybackrate" src={source} style={{ width: '100%' }} />
      </div>
    );
  }

  return (
    <div className="lesson-player">
      <video
        src={source}
        title={title || 'Conteúdo'}
        controls
        controlsList="nodownload noplaybackrate"
        playsInline
        preload="metadata"
      />
    </div>
  );
}
