export function isSafariLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

export function duetMimeType(videoOnly = false, audioOnly = false) {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const options = audioOnly
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    : videoOnly
      ? ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((type) => MediaRecorder.isTypeSupported(type));
}

export function duetRecorderOptions(type?: string, audioOnly = false): MediaRecorderOptions {
  const options: MediaRecorderOptions = {};
  if (type) options.mimeType = type;
  if (!audioOnly) options.videoBitsPerSecond = isSafariLike() ? 2500000 : 5200000;
  options.audioBitsPerSecond = audioOnly ? 160000 : 192000;
  return options;
}

export function startDuetRecorder(stream: MediaStream, chunks: Blob[], kind: 'video' | 'audio' | 'mixed') {
  const type = kind === 'video' ? duetMimeType(true, false) : kind === 'audio' ? duetMimeType(false, true) : duetMimeType();
  const recorder = new MediaRecorder(stream, duetRecorderOptions(type, kind === 'audio'));
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(1000);
  return recorder;
}

export function waitForMediaReady(media: HTMLMediaElement) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    const timeout = window.setTimeout(() => cleanup(() => reject(new Error('media_timeout'))), 18000);
    const ok = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('media_error')));
    const cleanup = (callback: () => void) => {
      window.clearTimeout(timeout);
      media.removeEventListener('loadedmetadata', ok);
      media.removeEventListener('canplay', ok);
      media.removeEventListener('error', fail);
      callback();
    };
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
}
