import type { DuetV2RecorderKind } from './types';

export function isSafariLikeV2() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

export function getSupportedMimeType(kind: DuetV2RecorderKind) {
  if (typeof MediaRecorder === 'undefined') return undefined;

  const audioTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];

  const videoTypes = [
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];

  const videoOnlyTypes = [
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
  ];

  const list = kind === 'voice' || kind === 'reference'
    ? audioTypes
    : kind === 'camera' || kind === 'canvas'
      ? videoOnlyTypes
      : videoTypes;

  return list.find((type) => MediaRecorder.isTypeSupported(type));
}

export function recorderOptions(kind: DuetV2RecorderKind): MediaRecorderOptions {
  const mimeType = getSupportedMimeType(kind);
  const options: MediaRecorderOptions = {};
  if (mimeType) options.mimeType = mimeType;
  if (kind === 'voice' || kind === 'reference') options.audioBitsPerSecond = 160000;
  else {
    options.videoBitsPerSecond = isSafariLikeV2() ? 2400000 : 5200000;
    if (kind === 'mixed') options.audioBitsPerSecond = 192000;
  }
  return options;
}

export function waitForMediaReadyV2(media: HTMLMediaElement, timeoutMs = 24000) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    let settled = false;
    const cleanup = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      media.removeEventListener('loadedmetadata', ok);
      media.removeEventListener('loadeddata', ok);
      media.removeEventListener('canplay', ok);
      media.removeEventListener('error', fail);
      callback();
    };
    const ok = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('media_error')));
    const timeout = window.setTimeout(() => cleanup(resolve), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('loadeddata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
}

export function blobFromChunks(chunks: Blob[], mimeType?: string) {
  if (!chunks.length) return null;
  return new Blob(chunks, { type: mimeType || chunks[0]?.type || 'application/octet-stream' });
}

export function stopTracks(stream?: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function safeStopRecorder(recorder?: MediaRecorder | null) {
  try {
    if (recorder?.state === 'recording') recorder.stop();
  } catch {}
}
