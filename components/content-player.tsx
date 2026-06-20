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

export function ContentPlayer({ title, mediaType, driveUrl, mediaUrl }: ContentPlayerProps) {
  const source = mediaUrl || driveUrl || '';
  const driveFileId = getDriveFileId(source);
  const embedUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/preview` : source;
  const type = mediaType || 'video';

  if (!source) {
    return (
      <div className="lesson-player empty-player">
        <strong>Material ainda nao conectado</strong>
        <p className="muted">Adicione um arquivo do Drive para liberar o player interno.</p>
      </div>
    );
  }

  if (type === 'audio' && !driveFileId) {
    return (
      <div className="lesson-player">
        <audio controls src={source} style={{ width: '100%' }} />
      </div>
    );
  }

  return (
    <div className="lesson-player">
      <iframe
        src={embedUrl}
        title={title || 'Conteudo'}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
