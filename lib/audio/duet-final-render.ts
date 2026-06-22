import type { VoicePreset } from './duet-buffer-engine';
import { clampLatencyMs } from './duet-latency';

export type FinalRenderSettings = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
  latencyMs?: number;
};

export type RenderArgs = {
  visualBlob: Blob;
  voiceBlob: Blob;
  referenceBlob?: Blob | null;
  referenceSource?: string | null;
  settings: FinalRenderSettings;
};

function isSafariLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

function recorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
}

function waitReady(media: HTMLMediaElement) {
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

async function decodeBlob(ctx: AudioContext, blob: Blob) {
  const buffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(buffer.slice(0));
}

async function decodeUrl(ctx: AudioContext, url: string) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error('reference_fetch_failed');
  const buffer = await response.arrayBuffer();
  return ctx.decodeAudioData(buffer.slice(0));
}

function rmsNormalize(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / 30000));
  let sum = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += step) {
    sum += data[index] * data[index];
    count++;
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  if (!Number.isFinite(rms) || rms <= 0.0001) return 3.2;
  return Math.max(1.35, Math.min(6.4, 0.22 / rms));
}

function applyVoicePreset(ctx: AudioContext, input: AudioNode, destination: AudioNode, preset: VoicePreset, voiceGainValue: number) {
  const gain = ctx.createGain();
  const highpass = ctx.createBiquadFilter();
  const body = ctx.createBiquadFilter();
  const presence = ctx.createBiquadFilter();
  const air = ctx.createBiquadFilter();
  const compressor = ctx.createDynamicsCompressor();
  const delay = ctx.createDelay(0.45);
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();

  const presetMap = {
    natural: { highpass: 65, body: 0.2, presence: 0.8, air: 0.4, threshold: -18, ratio: 1.8, delay: 0.001, wet: 0, dry: 1 },
    studio: { highpass: 92, body: 2.4, presence: 6.2, air: 4.5, threshold: -32, ratio: 5.8, delay: 0.018, wet: 0.05, dry: 0.95 },
    worship: { highpass: 105, body: 1.4, presence: 4.8, air: 5.6, threshold: -30, ratio: 4.6, delay: 0.16, wet: 0.28, dry: 0.9 },
    coral: { highpass: 115, body: 0.6, presence: 3.2, air: 2.2, threshold: -28, ratio: 4, delay: 0.035, wet: 0.36, dry: 0.82 },
  } satisfies Record<VoicePreset, { highpass: number; body: number; presence: number; air: number; threshold: number; ratio: number; delay: number; wet: number; dry: number }>;
  const current = presetMap[preset];

  gain.gain.value = voiceGainValue;
  highpass.type = 'highpass';
  highpass.frequency.value = current.highpass;
  body.type = 'peaking';
  body.frequency.value = 240;
  body.Q.value = 0.7;
  body.gain.value = current.body;
  presence.type = 'peaking';
  presence.frequency.value = 3300;
  presence.Q.value = 0.85;
  presence.gain.value = current.presence;
  air.type = 'highshelf';
  air.frequency.value = 7200;
  air.gain.value = current.air;
  compressor.threshold.value = current.threshold;
  compressor.knee.value = 14;
  compressor.ratio.value = current.ratio;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.14;
  delay.delayTime.value = current.delay;
  wet.gain.value = current.wet;
  dry.gain.value = current.dry;
  limiter.threshold.value = -4.8;
  limiter.knee.value = 1.5;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.0015;
  limiter.release.value = 0.07;

  input.connect(gain).connect(highpass).connect(body).connect(presence).connect(air).connect(compressor);
  compressor.connect(dry).connect(limiter);
  compressor.connect(delay).connect(wet).connect(limiter);
  limiter.connect(destination);
}

export async function renderFinalDuetVideo({ visualBlob, voiceBlob, referenceBlob, referenceSource, settings }: RenderArgs) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('audio_context_missing');

  const visual = document.createElement('video');
  visual.src = URL.createObjectURL(visualBlob);
  visual.muted = true;
  visual.playsInline = true;
  await waitReady(visual);

  const audioCtx = new AudioCtx({ latencyHint: 'playback', sampleRate: 48000 });
  const [voiceBuffer, referenceBuffer] = await Promise.all([
    decodeBlob(audioCtx, voiceBlob),
    referenceBlob ? decodeBlob(audioCtx, referenceBlob) : decodeUrl(audioCtx, referenceSource || ''),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = isSafariLike() ? 960 : 1280;
  canvas.height = isSafariLike() ? 540 : 720;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('canvas_failed');

  const destination = audioCtx.createMediaStreamDestination();
  const voiceSource = audioCtx.createBufferSource();
  const referenceSourceNode = audioCtx.createBufferSource();
  const referenceGain = audioCtx.createGain();
  voiceSource.buffer = voiceBuffer;
  referenceSourceNode.buffer = referenceBuffer;
  referenceGain.gain.value = referenceTarget(settings.referenceVolume);
  referenceSourceNode.connect(referenceGain).connect(destination);
  applyVoicePreset(audioCtx, voiceSource, destination, settings.preset, normalizeVoiceTarget(settings.voiceVolume) * rmsNormalize(voiceBuffer));

  const outputStream = new MediaStream([
    ...canvas.captureStream(isSafariLike() ? 24 : 30).getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
  const mimeType = recorderMimeType();
  const recorder = new MediaRecorder(outputStream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: isSafariLike() ? 2500000 : 5200000,
    audioBitsPerSecond: 192000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
  });

  let frame = 0;
  const draw = () => {
    if (visual.paused || visual.ended) return;
    ctx2d.drawImage(visual, 0, 0, canvas.width, canvas.height);
    frame = requestAnimationFrame(draw);
  };
  const stop = () => {
    try { voiceSource.stop(); } catch {}
    try { referenceSourceNode.stop(); } catch {}
    cancelAnimationFrame(frame);
    if (recorder.state === 'recording') recorder.stop();
  };

  recorder.start(1000);
  visual.currentTime = 0;
  await audioCtx.resume().catch(() => undefined);
  const startAt = audioCtx.currentTime + 0.06;
  const voiceOffset = Math.min(Math.max(0, clampLatencyMs(settings.latencyMs || 0) / 1000), Math.max(0, voiceBuffer.duration - 0.02));
  voiceSource.start(startAt, voiceOffset);
  referenceSourceNode.start(startAt, 0);
  const startDelayMs = Math.max(0, (startAt - audioCtx.currentTime) * 1000);
  window.setTimeout(() => {
    visual.play().then(draw).catch(stop);
  }, startDelayMs);
  visual.onended = stop;
  window.setTimeout(stop, Math.max(2500, (visual.duration || 90) * 1000 + startDelayMs + 900));
  const rendered = await done;
  await audioCtx.close().catch(() => undefined);
  return rendered;
}

export function normalizeVoiceTarget(volume: number) {
  return Math.max(0, Math.min(3.2, volume / 100));
}

export function referenceTarget(volume: number) {
  return Math.max(0, Math.min(1.5, volume / 100));
}
