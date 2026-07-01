import { attachMediaSource } from '@/lib/media/hls-client';
import type { DuetFaderValues } from './duet-audio-engine';
import { toReferenceGain } from './duet-audio-engine';

type LiveDuetRenderOptions = {
  visualBlob: Blob;
  voiceBlob: Blob;
  referenceUrl: string;
  faders: DuetFaderValues;
  preGains?: Partial<{ voice: number; reference: number }>;
  referenceOffsetMs?: number;
  sampleRate?: number;
};

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_VOICE_PRE_GAIN = 3.2;
const DEFAULT_REFERENCE_PRE_GAIN = 10;

function debug(label: string, data?: Record<string, unknown>) { try { console.info(`[duet-live-render] ${label}`, data || {}); } catch {} }
function linearGain(percent: number, preGain: number) { if (!Number.isFinite(percent)) return 0; return Math.max(0, Math.min(6, (percent / 100) * preGain)); }
function clampOffsetMs(value?: number) { return Math.max(-300, Math.min(300, Number.isFinite(value || 0) ? value || 0 : 0)); }
function isSafariLike() { if (typeof navigator === 'undefined') return false; const ua = navigator.userAgent; return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua)); }

function recorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const iosSafeCandidates = ['video/mp4', 'video/mp4;codecs=h264,aac', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const defaultCandidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const candidates = isSafariLike() ? iosSafeCandidates : defaultCandidates;
  const support = candidates.map((type) => [type, MediaRecorder.isTypeSupported(type)]);
  const selected = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  debug('mime-selected', { selected, support, safariLike: isSafariLike(), userAgent: navigator.userAgent });
  return selected;
}

function waitForMediaReady(media: HTMLMediaElement, timeoutMs = 18000) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    let done = false;
    const cleanup = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      media.removeEventListener('loadedmetadata', ok);
      media.removeEventListener('loadeddata', ok);
      media.removeEventListener('canplay', ok);
      media.removeEventListener('error', fail);
      fn();
    };
    const ok = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('live_render_media_failed')));
    const timer = window.setTimeout(() => cleanup(() => reject(new Error(`live_render_media_timeout:readyState=${media.readyState}:networkState=${media.networkState}`))), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('loadeddata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
}

async function makeVideoFromBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = url;
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = true;
  video.volume = 0;
  await waitForMediaReady(video);
  debug('visual-ready', { size: blob.size, type: blob.type, duration: video.duration });
  return { video, url };
}

async function makeAudioFromBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = document.createElement('audio');
  audio.src = url;
  audio.preload = 'auto';
  audio.muted = false;
  audio.volume = 1;
  await waitForMediaReady(audio);
  debug('voice-ready', { size: blob.size, type: blob.type, duration: audio.duration });
  return { audio, url };
}

async function makeReferenceVideo(url: string) {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = false;
  video.volume = 1;
  video.crossOrigin = 'anonymous';
  const attachment = await attachMediaSource(video, url);
  await waitForMediaReady(video);
  debug('reference-ready', { url, duration: video.duration, readyState: video.readyState, networkState: video.networkState });
  return { video, attachment };
}

function makeCanvasVideoStream(visual: HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  canvas.width = isSafariLike() ? 960 : 1280;
  canvas.height = isSafariLike() ? 540 : 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_failed');
  let frame = 0;
  let stopped = false;
  const draw = () => {
    if (stopped) return;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try { ctx.drawImage(visual, 0, 0, canvas.width, canvas.height); } catch {}
    frame = requestAnimationFrame(draw);
  };
  draw();
  return { stream: canvas.captureStream(isSafariLike() ? 24 : 30), stop: () => { stopped = true; cancelAnimationFrame(frame); } };
}

function configureCompressor(node: DynamicsCompressorNode) { node.threshold.value = -22; node.knee.value = 18; node.ratio.value = 2.6; node.attack.value = 0.008; node.release.value = 0.16; }
function configureLimiter(node: DynamicsCompressorNode) { node.threshold.value = -3; node.knee.value = 0; node.ratio.value = 18; node.attack.value = 0.003; node.release.value = 0.08; }

export async function renderLiveDuetVideo(options: LiveDuetRenderOptions) {
  debug('start', { faders: options.faders, referenceOffsetMs: options.referenceOffsetMs, referenceUrl: options.referenceUrl });
  const { video: visual, url: visualUrl } = await makeVideoFromBlob(options.visualBlob);
  const { audio: voice, url: voiceUrl } = await makeAudioFromBlob(options.voiceBlob);
  const { video: reference, attachment: referenceAttachment } = await makeReferenceVideo(options.referenceUrl);
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('audio_context_missing');
  const audioContext = new AudioCtx({ sampleRate: options.sampleRate || DEFAULT_SAMPLE_RATE, latencyHint: 'playback' });
  const destination = audioContext.createMediaStreamDestination();
  const limiter = audioContext.createDynamicsCompressor();
  configureLimiter(limiter);
  limiter.connect(destination);

  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0.00001;
  const silentOscillator = audioContext.createOscillator();
  silentOscillator.frequency.value = 20;
  silentOscillator.connect(silentGain).connect(limiter);

  const voiceGain = audioContext.createGain();
  const voiceCompressor = audioContext.createDynamicsCompressor();
  configureCompressor(voiceCompressor);
  voiceGain.gain.value = linearGain(options.faders.voice, options.preGains?.voice ?? DEFAULT_VOICE_PRE_GAIN);
  audioContext.createMediaElementSource(voice).connect(voiceCompressor).connect(voiceGain).connect(limiter);

  const referenceGain = audioContext.createGain();
  referenceGain.gain.value = toReferenceGain(options.faders.reference, options.preGains?.reference ?? DEFAULT_REFERENCE_PRE_GAIN);
  audioContext.createMediaElementSource(reference).connect(referenceGain).connect(limiter);

  const audioTrack = destination.stream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.onmute = () => debug('destination-audio-muted', { readyState: audioTrack.readyState });
    audioTrack.onunmute = () => debug('destination-audio-unmuted', { readyState: audioTrack.readyState });
    audioTrack.onended = () => debug('destination-audio-ended', { readyState: audioTrack.readyState });
  }

  const videoCapture = makeCanvasVideoStream(visual);
  const stream = new MediaStream([...videoCapture.stream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  const mimeType = recorderMimeType();
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: isSafariLike() ? 2500000 : 5200000, audioBitsPerSecond: 256000 });
  const chunks: Blob[] = [];
  recorder.onstart = () => debug('recorder-start', { mimeType: recorder.mimeType, audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length });
  recorder.ondataavailable = (event) => { debug('recorder-chunk', { size: event.data?.size || 0 }); if (event.data?.size) chunks.push(event.data); };
  const done = new Promise<Blob>((resolve) => { recorder.onstop = () => { const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }); debug('recorder-stop', { chunks: chunks.length, size: blob.size, type: blob.type }); resolve(blob); }; });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    debug('stop-requested', { visualTime: visual.currentTime, voiceTime: voice.currentTime, referenceTime: reference.currentTime, recorderState: recorder.state });
    try { recorder.requestData(); } catch {}
    try { visual.pause(); } catch {}
    try { voice.pause(); } catch {}
    try { reference.pause(); } catch {}
    try { silentOscillator.stop(); } catch {}
    window.setTimeout(() => { try { if (recorder.state === 'recording') recorder.stop(); } catch {} }, 220);
  };

  await audioContext.resume().catch(() => undefined);
  silentOscillator.start();
  debug('silent-keeper-started', { gain: silentGain.gain.value });
  recorder.start(500);
  visual.currentTime = 0;
  voice.currentTime = 0;
  reference.currentTime = 0;
  const offsetSeconds = clampOffsetMs(options.referenceOffsetMs) / 1000;
  if (offsetSeconds < 0) {
    await reference.play().then(() => debug('reference-playing', { currentTime: reference.currentTime })).catch((error) => debug('reference-play-failed', { message: error instanceof Error ? error.message : String(error) }));
    window.setTimeout(() => {
      visual.play().then(() => debug('visual-playing', { currentTime: visual.currentTime })).catch(() => undefined);
      voice.play().then(() => debug('voice-playing', { currentTime: voice.currentTime })).catch((error) => debug('voice-play-failed', { message: error instanceof Error ? error.message : String(error) }));
    }, Math.abs(offsetSeconds) * 1000);
  } else {
    await Promise.all([
      visual.play().then(() => debug('visual-playing', { currentTime: visual.currentTime })),
      voice.play().then(() => debug('voice-playing', { currentTime: voice.currentTime })).catch((error) => debug('voice-play-failed', { message: error instanceof Error ? error.message : String(error) })),
    ]);
    window.setTimeout(() => { reference.play().then(() => debug('reference-playing', { currentTime: reference.currentTime })).catch((error) => debug('reference-play-failed', { message: error instanceof Error ? error.message : String(error) })); }, offsetSeconds * 1000);
  }

  const durationSeconds = Math.max(visual.duration || 0, voice.duration || 0, Number.isFinite(reference.duration) ? reference.duration : 0, 1);
  visual.onended = () => window.setTimeout(stop, 350);
  window.setTimeout(stop, durationSeconds * 1000 + Math.abs(offsetSeconds) * 1000 + 1200);
  const blob = await done;
  videoCapture.stop();
  try { referenceAttachment.destroy(); } catch {}
  await audioContext.close().catch(() => undefined);
  URL.revokeObjectURL(visualUrl);
  URL.revokeObjectURL(voiceUrl);
  if (blob.size < 1000) throw new Error(`rendered_video_empty:${blob.size}`);
  return { blob, mimeType: blob.type || mimeType || 'video/webm', durationSeconds, referenceIncluded: true };
}
