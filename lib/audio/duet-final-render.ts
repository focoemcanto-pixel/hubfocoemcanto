import type { VoicePreset } from './duet-buffer-engine';

export type FinalRenderSettings = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
};

type RenderArgs = {
  visualBlob: Blob;
  voiceBlob: Blob;
  referenceSource: string;
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
  const compressor = ctx.createDynamicsCompressor();
  const delay = ctx.createDelay(0.35);
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();

  gain.gain.value = voiceGainValue;
  highpass.type = 'highpass';
  highpass.frequency.value = preset === 'natural' ? 70 : 95;
  body.type = 'peaking';
  body.frequency.value = 240;
  body.Q.value = 0.75;
  body.gain.value = preset === 'studio' ? 1.5 : preset === 'worship' ? 1.1 : 0.4;
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 0.9;
  presence.gain.value = preset === 'natural' ? 1.2 : preset === 'coral' ? 2.2 : 3.5;
  compressor.threshold.value = preset === 'natural' ? -22 : -30;
  compressor.knee.value = 18;
  compressor.ratio.value = preset === 'natural' ? 2.4 : 4.8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.16;
  delay.delayTime.value = preset === 'coral' ? 0.028 : preset === 'worship' ? 0.12 : 0.001;
  wet.gain.value = preset === 'coral' ? 0.18 : preset === 'worship' ? 0.14 : 0;
  dry.gain.value = preset === 'natural' ? 1 : 0.94;
  limiter.threshold.value = -4.8;
  limiter.knee.value = 1.5;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.0015;
  limiter.release.value = 0.07;

  input.connect(gain).connect(highpass).connect(body).connect(presence).connect(compressor);
  compressor.connect(dry).connect(limiter);
  compressor.connect(delay).connect(wet).connect(limiter);
  limiter.connect(destination);
}

export async function renderFinalDuetVideo({ visualBlob, voiceBlob, referenceSource, settings }: RenderArgs) {
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
    decodeUrl(audioCtx, referenceSource),
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
  voiceSource.start(startAt, 0);
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
