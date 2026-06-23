'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';

type ContentPlayerProps = {
  title?: string | null;
  mediaType?: string | null;
  driveUrl?: string | null;
  mediaUrl?: string | null;
  lessonId?: string | null;
  initialPositionSeconds?: number | null;
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

async function saveProgress(lessonId: string | null | undefined, positionSeconds: number, completed = false) {
  if (!lessonId) return;
  await fetch('/api/student/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exerciseId: lessonId, positionSeconds, completed }),
  }).catch(() => undefined);
}

export function ContentPlayer({ title, mediaType, driveUrl, mediaUrl, lessonId, initialPositionSeconds = 0 }: ContentPlayerProps) {
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedAtRef = useRef(0);
  const restoredRef = useRef(false);

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
    restoredRef.current = false;
    const video = videoRef.current;
    if (!video || !source || type === 'audio') return;
    video.load();
    const timer = window.setTimeout(() => {
      video.preload = 'auto';
      video.load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [source, type]);

  function restorePosition(element: HTMLMediaElement | null) {
    if (!element || restoredRef.current) return;
    const position = Math.floor(initialPositionSeconds || 0);
    if (position > 5 && Number.isFinite(element.duration) && position < element.duration - 8) {
      element.currentTime = position;
    }
    restoredRef.current = true;
  }

  function handleTimeUpdate(element: HTMLMediaElement | null) {
    if (!element || !lessonId) return;
    const now = Date.now();
    if (now - lastSavedAtRef.current < 10000) return;
    lastSavedAtRef.current = now;
    saveProgress(lessonId, element.currentTime, false);
  }

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
        <audio
          ref={audioRef}
          controls
          controlsList="nodownload noplaybackrate"
          src={source}
          preload="auto"
          style={{ width: '100%' }}
          onLoadedMetadata={() => restorePosition(audioRef.current)}
          onPlay={() => saveProgress(lessonId, audioRef.current?.currentTime || 0, false)}
          onTimeUpdate={() => handleTimeUpdate(audioRef.current)}
          onEnded={() => saveProgress(lessonId, audioRef.current?.duration || 0, true)}
        />
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
        onLoadedMetadata={() => { setIsReady(true); restorePosition(videoRef.current); }}
        onCanPlay={() => { setIsReady(true); setIsBuffering(false); }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => { setHasStarted(true); setIsBuffering(false); saveProgress(lessonId, videoRef.current?.currentTime || 0, false); }}
        onPlay={() => setHasStarted(true)}
        onTimeUpdate={() => handleTimeUpdate(videoRef.current)}
        onEnded={() => saveProgress(lessonId, videoRef.current?.duration || 0, true)}
      />
    </div>
  );
}
