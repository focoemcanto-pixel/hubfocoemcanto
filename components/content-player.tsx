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
  trimStartSeconds?: number | null;
  trimEndSeconds?: number | null;
  nextLessonSlug?: string | null;
  nextLessonTitle?: string | null;
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

function isHlsUrl(url: string) {
  return /\.m3u8(\?|#|$)/i.test(url);
}

function isAllowedInternalMedia(url: string) {
  if (url.startsWith('/api/media/drive/') || url.startsWith('/api/media/library/') || url.startsWith('/storage/v1/object/')) return true;
  if (isHlsUrl(url)) return url.startsWith('/') || /^https:\/\//i.test(url);
  return false;
}

function canPlayNativeHls(video: HTMLVideoElement) {
  return Boolean(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'));
}

async function saveProgress(lessonId: string | null | undefined, positionSeconds: number, completed = false) {
  if (!lessonId) return;
  await fetch('/api/student/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exerciseId: lessonId, positionSeconds, completed }),
  }).catch(() => undefined);
}

function installLessonsPanelToggle() {
  const styleId = 'fc-lessons-panel-toggle-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '[class*="modules-actions"]{display:flex;align-items:center;gap:8px}.fc-lessons-toggle,.fc-module-toggle{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;border:1px solid rgba(245,199,107,.22);background:rgba(255,255,255,.045);color:#f5c76b;font-weight:900;line-height:1}.fc-lessons-toggle{width:42px;height:42px;font-size:24px}.fc-module-toggle{width:34px;height:34px;font-size:18px;margin-left:auto}.fc-lessons-collapsed [class*="module-list"]{display:none}.fc-lessons-collapsed{max-height:110px!important;overflow:hidden}.fc-lessons-collapsed [class*="modules-head"]{border-bottom:0!important}.fc-module-collapsed [class*="lessons-list"]{display:none}.fc-module-collapsed{padding-bottom:0!important}.fc-module-collapsed [class*="module-title"]{margin-bottom:0!important}';
    document.head.appendChild(style);
  }
  document.querySelectorAll<HTMLElement>('[class*="modules-panel"]').forEach((panel) => {
    if (panel.dataset.fcPanelToggleReady !== '1') {
      const head = panel.querySelector<HTMLElement>('[class*="modules-head"]');
      const closeLink = head?.querySelector<HTMLAnchorElement>('a:last-child');
      if (head) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'fc-lessons-toggle';
        toggle.setAttribute('aria-label', 'Minimizar painel de aulas');
        toggle.textContent = '^';
        toggle.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const collapsed = panel.classList.toggle('fc-lessons-collapsed');
          toggle.textContent = collapsed ? 'v' : '^';
          toggle.setAttribute('aria-label', collapsed ? 'Exibir painel de aulas' : 'Minimizar painel de aulas');
        });
        if (closeLink) head.insertBefore(toggle, closeLink);
        else head.appendChild(toggle);
        panel.dataset.fcPanelToggleReady = '1';
      }
    }
    panel.querySelectorAll<HTMLElement>('[class*="module-group"]').forEach((group) => {
      if (group.dataset.fcModuleToggleReady === '1') return;
      const title = group.querySelector<HTMLElement>('[class*="module-title"]');
      const list = group.querySelector<HTMLElement>('[class*="lessons-list"]');
      if (!title || !list) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fc-module-toggle';
      button.setAttribute('aria-label', 'Minimizar aulas deste módulo');
      button.textContent = '^';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const collapsed = group.classList.toggle('fc-module-collapsed');
        button.textContent = collapsed ? 'v' : '^';
        button.setAttribute('aria-label', collapsed ? 'Exibir aulas deste módulo' : 'Minimizar aulas deste módulo');
      });
      title.appendChild(button);
      group.dataset.fcModuleToggleReady = '1';
    });
  });
}

export function ContentPlayer({ title, mediaType, driveUrl, mediaUrl, lessonId, initialPositionSeconds = 0, trimStartSeconds = 0, trimEndSeconds = 0, nextLessonSlug: _nextLessonSlug, nextLessonTitle: _nextLessonTitle }: ContentPlayerProps) {
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedAtRef = useRef(0);
  const restoredRef = useRef(false);
  const trimStart = Math.max(0, Number(trimStartSeconds || 0));
  const trimEnd = Math.max(0, Number(trimEndSeconds || 0));

  const { source, type, isHls } = useMemo(() => {
    const rawSource = driveUrl || mediaUrl || '';
    const driveFileId = getDriveFileId(rawSource);
    const resolvedSource = driveFileId ? `/api/media/drive/${driveFileId}` : isAllowedInternalMedia(rawSource) ? rawSource : '';
    const resolvedType = String(mediaType || '').toLowerCase() || 'video';
    return {
      type: resolvedType,
      source: resolvedSource,
      isHls: isHlsUrl(resolvedSource) || resolvedType === 'hls' || resolvedType === 'application/vnd.apple.mpegurl',
    };
  }, [driveUrl, mediaUrl, mediaType]);

  useEffect(() => {
    installLessonsPanelToggle();
    const timer = window.setTimeout(installLessonsPanelToggle, 350);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setIsReady(false);
    setHasStarted(false);
    setIsBuffering(false);
    restoredRef.current = false;
    const video = videoRef.current;
    if (!video || !source || type === 'audio') return undefined;

    video.preload = 'metadata';

    if (!isHls) {
      video.src = source;
      video.load();
      return undefined;
    }

    if (canPlayNativeHls(video)) {
      video.src = source;
      video.load();
      return undefined;
    }

    let destroyed = false;
    let hlsInstance: { destroy: () => void; loadSource: (source: string) => void; attachMedia: (media: HTMLMediaElement) => void; on: (...args: any[]) => void } | null = null;

    import('hls.js')
      .then(({ default: Hls }) => {
        if (destroyed || !Hls.isSupported()) {
          if (!destroyed) {
            video.src = source;
            video.load();
          }
          return;
        }
        const hls = new Hls({
          capLevelToPlayerSize: true,
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 90,
          startLevel: -1,
        });
        hlsInstance = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => setIsReady(true));
        hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string }) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else hls.destroy();
        });
        hls.loadSource(source);
        hls.attachMedia(video);
      })
      .catch(() => {
        if (!destroyed) {
          video.src = source;
          video.load();
        }
      });

    return () => {
      destroyed = true;
      hlsInstance?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [source, type, isHls]);

  function restorePosition(element: HTMLMediaElement | null) {
    if (!element || restoredRef.current) return;
    const saved = Math.floor(initialPositionSeconds || 0);
    const position = Math.max(trimStart, saved > trimStart ? saved : trimStart);
    if (position > 0 && Number.isFinite(element.duration) && position < element.duration - 1) element.currentTime = position;
    restoredRef.current = true;
  }

  function prepareForSmoothPlayback(element: HTMLMediaElement | null) {
    if (!element) return;
    if (element.preload !== 'auto') {
      element.preload = 'auto';
      if (!isHls) element.load();
    }
    if (element.currentTime < trimStart) element.currentTime = trimStart;
  }

  function handleTimeUpdate(element: HTMLMediaElement | null) {
    if (!element) return;
    if (trimEnd > trimStart && element.currentTime >= trimEnd) {
      element.pause();
      element.currentTime = trimStart;
      saveProgress(lessonId, trimEnd, true);
      return;
    }
    if (!lessonId) return;
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
          preload="metadata"
          style={{ width: '100%' }}
          onLoadedMetadata={() => restorePosition(audioRef.current)}
          onPlay={() => { prepareForSmoothPlayback(audioRef.current); saveProgress(lessonId, audioRef.current?.currentTime || 0, false); }}
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
          <small>{isHls ? 'Preparando streaming adaptativo...' : 'Carregando informações do vídeo...'}</small>
        </div>
      ) : null}
      {isReady && !hasStarted ? (
        <button className="premium-video-start" type="button" onClick={() => { setHasStarted(true); setIsBuffering(true); prepareForSmoothPlayback(videoRef.current); videoRef.current?.play().catch(() => { setIsBuffering(false); }); }} aria-label="Reproduzir aula">
          <Play size={32} fill="currentColor" />
        </button>
      ) : null}
      {isBuffering && hasStarted ? <div className="premium-video-buffer"><Loader2 size={22} /></div> : null}
      <video
        ref={videoRef}
        title={title || 'Conteúdo'}
        controls
        controlsList="nodownload noplaybackrate"
        playsInline
        preload="metadata"
        onLoadedMetadata={() => { setIsReady(true); restorePosition(videoRef.current); }}
        onCanPlay={() => { setIsReady(true); setIsBuffering(false); }}
        onCanPlayThrough={() => { setIsReady(true); setIsBuffering(false); }}
        onWaiting={() => setIsBuffering(true)}
        onStalled={() => setIsBuffering(true)}
        onPlaying={() => { setHasStarted(true); setIsBuffering(false); saveProgress(lessonId, videoRef.current?.currentTime || 0, false); }}
        onPlay={() => { setHasStarted(true); prepareForSmoothPlayback(videoRef.current); }}
        onTimeUpdate={() => handleTimeUpdate(videoRef.current)}
        onEnded={() => saveProgress(lessonId, videoRef.current?.duration || 0, true)}
      />
    </div>
  );
}
