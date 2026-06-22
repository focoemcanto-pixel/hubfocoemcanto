'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';

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
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const { source, type } = useMemo(() => {
    const rawSource = driveUrl || mediaUrl || '';
    const driveFileId = getDriveFileId(rawSource);
    return {
      type: mediaType || 'video',
      source: driveFileId ? `/api/media/drive/${driveFileId}` : isAllowedInternalMedia(rawSource) ? rawSource : '',
    };
  }, [driveUrl, mediaUrl, mediaType]);

  useEffect(() => {
    setIsReady(false);
    setHasStarted(false);
    setIsBuffering(true);
    const video = videoRef.current;
    if (!video || !source || type === 'audio') return;
    video.load();
    const timer = window.setTimeout(() => {
      video.preload = 'auto';
      video.load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [source, type]);

  if (!source) {
    return (
      <div className="lesson-player empty-player premium-loading-player">
        <strong>Material protegido</strong>
        <p className="muted">Este conteúdo só pode ser acessado pelo player interno do Hub.</p>
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div className="lesson-player premium-audio-player">
        <audio controls controlsList="nodownload noplaybackrate" src={source} preload="auto" style={{ width: '100%' }} />
      </div>
    );
  }

  return (
    <div className="lesson-player premium-video-player">
      {!isReady ? (
        <div className="premium-video-loading" aria-live="polite">
          <span className="premium-video-glow" />
          <Loader2 size={26} className="premium-video-spinner" />
          <strong>Preparando aula</strong>
          <small>Carregando vídeo em alta qualidade...</small>
        </div>
      ) : null}
      {isReady && !hasStarted ? (
        <button className="premium-video-start" type="button" onClick={() => { setHasStarted(true); videoRef.current?.play().catch(() => undefined); }} aria-label="Reproduzir aula">
          <Play size={32} fill="currentColor" />
        </button>
      ) : null}
      {isBuffering && hasStarted ? <div className="premium-video-buffer"><Loader2 size={22} /></div> : null}
      <video
        ref={videoRef}
        src={source}
        title={title || 'Conteúdo'}
        controls
        controlsList="nodownload noplaybackrate"
        playsInline
        preload="auto"
        onLoadedMetadata={() => setIsReady(true)}
        onCanPlay={() => { setIsReady(true); setIsBuffering(false); }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => { setHasStarted(true); setIsBuffering(false); }}
        onPlay={() => setHasStarted(true)}
      />
    </div>
  );
}
