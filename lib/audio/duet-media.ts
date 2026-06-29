export function isSafariLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

function shouldUseLowDataRecording() {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const effectiveType = String(connection?.effectiveType || '').toLowerCase();
  return Boolean(connection?.saveData) || ['slow-2g', '2g', '3g'].includes(effectiveType);
}

export function duetMimeType(videoOnly = false, audioOnly = false) {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const options = audioOnly
    ? ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
    : videoOnly
      ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm']
      : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return options.find((type) => MediaRecorder.isTypeSupported(type));
}

export function duetRecorderOptions(type?: string, audioOnly = false): MediaRecorderOptions {
  const options: MediaRecorderOptions = {};
  if (type) options.mimeType = type;
  const lowData = shouldUseLowDataRecording();
  if (!audioOnly) options.videoBitsPerSecond = lowData ? 1800000 : isSafariLike() ? 3000000 : 6200000;
  options.audioBitsPerSecond = audioOnly ? (lowData ? 128000 : 256000) : (lowData ? 160000 : 256000);
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
