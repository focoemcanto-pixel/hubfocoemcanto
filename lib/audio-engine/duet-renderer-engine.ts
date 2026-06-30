import type { DuetFaderValues } from './duet-audio-engine';

export type DuetRendererEngineOptions = {
  visualBlob: Blob;
  voiceBlob: Blob;
  referenceUrl: string;
  faders: DuetFaderValues;
  preGains?: Partial<{ voice: number; reference: number }>;
  latencyMs?: number;
  referenceOffsetMs?: number;
  sampleRate?: number;
};

export type DuetRenderedAudio = {
  audioBuffer: AudioBuffer;
  wavBlob: Blob;
  durationSeconds: number;
  sampleRate: number;
  referenceIncluded: boolean;
};

export type DuetRenderedVideo = {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  referenceIncluded: boolean;
};

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_VOICE_PRE_GAIN = 3.2;
const DEFAULT_REFERENCE_PRE_GAIN = 0.08;

function linearGain(percent: number, preGain: number) {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(6, (percent / 100) * preGain));
}

function clampReferenceOffsetMs(value?: number) {
  return Math.max(-300, Math.min(300, Number.isFinite(value || 0) ? value || 0 : 0));
}

function withFullMedia(url: string) {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}full=1`;
}

function recorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function isSafariLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

async function blobToAudioBuffer(blob: Blob, sampleRate: number) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('audio_context_missing');
  const context = new AudioCtx({ sampleRate });
  try {
    const buffer = await blob.arrayBuffer();
    return await context.decodeAudioData(buffer.slice(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function urlToAudioBuffer(url: string, sampleRate: number) {
  const response = await fetch(withFullMedia(url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`reference_fetch_failed:${response.status}`);
  const blob = await response.blob();
  return blobToAudioBuffer(blob, sampleRate);
}

function configureCompressor(node: DynamicsCompressorNode) {
  node.threshold.value = -22;
  node.knee.value = 18;
  node.ratio.value = 2.6;
  node.attack.value = 0.008;
  node.release.value = 0.16;
}

function configureLimiter(node: DynamicsCompressorNode) {
  node.threshold.value = -3;
  node.knee.value = 0;
  node.ratio.value = 18;
  node.attack.value = 0.003;
  node.release.value = 0.08;
}

function audioBufferToWav(buffer: AudioBuffer) {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  let offset = 0;
  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    offset += value.length;
  };
  writeString('RIFF');
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, numberOfChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString('data');
  view.setUint32(offset, dataSize, true); offset += 4;

  const channels = Array.from({ length: numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
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
    const fail = () => cleanup(() => reject(new Error('render_media_load_failed')));
    const timer = window.setTimeout(() => cleanup(() => reject(new Error('render_media_timeout'))), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('loadeddata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
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

async function createAudioElementFromBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = document.createElement('audio');
  audio.src = url;
  audio.preload = 'auto';
  audio.volume = 0;
  audio.muted = false;
  await waitForMediaReady(audio);
  return { audio, url };
}

export class DuetRendererEngine {
  private options: DuetRendererEngineOptions;

  constructor(options: DuetRendererEngineOptions) {
    this.options = options;
  }

  async renderAudio(): Promise<DuetRenderedAudio> {
    const sampleRate = this.options.sampleRate || DEFAULT_SAMPLE_RATE;
    const voiceBuffer = await blobToAudioBuffer(this.options.voiceBlob, sampleRate);
    const referenceGainValue = linearGain(this.options.faders.reference, this.options.preGains?.reference ?? DEFAULT_REFERENCE_PRE_GAIN);
    const shouldIncludeReference = referenceGainValue > 0.000001;
    const referenceBuffer = shouldIncludeReference
      ? await urlToAudioBuffer(this.options.referenceUrl, sampleRate).catch(() => null)
      : null;

    const referenceOffsetMs = referenceBuffer ? clampReferenceOffsetMs(this.options.referenceOffsetMs) : 0;
    const referenceOffsetSeconds = referenceOffsetMs / 1000;
    const delayVoiceSeconds = Math.max(0, -referenceOffsetSeconds);
    const delayReferenceSeconds = Math.max(0, referenceOffsetSeconds);
    const duration = Math.max(
      voiceBuffer.duration + delayVoiceSeconds,
      referenceBuffer ? referenceBuffer.duration + delayReferenceSeconds : 0,
      1,
    );
    const frameCount = Math.ceil(duration * sampleRate);
    const context = new OfflineAudioContext({ numberOfChannels: 2, length: frameCount, sampleRate });

    const voiceSource = context.createBufferSource();
    const voiceGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const limiter = context.createDynamicsCompressor();
    configureCompressor(compressor);
    configureLimiter(limiter);

    voiceSource.buffer = voiceBuffer;
    voiceGain.gain.value = linearGain(this.options.faders.voice, this.options.preGains?.voice ?? DEFAULT_VOICE_PRE_GAIN);
    const latencySeconds = Math.max(0, Math.min(0.45, (this.options.latencyMs || 0) / 1000));
    voiceSource.connect(compressor).connect(voiceGain).connect(limiter);

    if (referenceBuffer) {
      const referenceSource = context.createBufferSource();
      const referenceGain = context.createGain();
      referenceSource.buffer = referenceBuffer;
      referenceGain.gain.value = referenceGainValue;
      referenceSource.connect(referenceGain).connect(limiter);
      referenceSource.start(delayReferenceSeconds);
    }

    limiter.connect(context.destination);
    voiceSource.start(latencySeconds + delayVoiceSeconds);

    const audioBuffer = await context.startRendering();
    return {
      audioBuffer,
      wavBlob: audioBufferToWav(audioBuffer),
      durationSeconds: audioBuffer.duration,
      sampleRate,
      referenceIncluded: Boolean(referenceBuffer),
    };
  }

  async renderVideo(): Promise<DuetRenderedVideo> {
    if (typeof MediaRecorder === 'undefined') throw new Error('media_recorder_missing');
    const renderedAudio = await this.renderAudio();
    const visualUrl = URL.createObjectURL(this.options.visualBlob);
    const visual = document.createElement('video');
    visual.src = visualUrl;
    visual.preload = 'auto';
    visual.playsInline = true;
    visual.muted = true;
    visual.volume = 0;
    await waitForMediaReady(visual);

    const { audio, url: audioUrl } = await createAudioElementFromBlob(renderedAudio.wavBlob);
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('audio_context_missing');
    const audioContext = new AudioCtx({ sampleRate: renderedAudio.sampleRate, latencyHint: 'playback' });
    const audioDestination = audioContext.createMediaStreamDestination();
    const audioSource = audioContext.createMediaElementSource(audio);
    audioSource.connect(audioDestination);

    const videoCapture = makeCanvasVideoStream(visual);
    const outputStream = new MediaStream([...videoCapture.stream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
    const mimeType = recorderMimeType();
    const recorder = new MediaRecorder(outputStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: isSafariLike() ? 2500000 : 5200000, audioBitsPerSecond: 256000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
    });

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try { recorder.requestData(); } catch {}
      try { visual.pause(); } catch {}
      try { audio.pause(); } catch {}
      window.setTimeout(() => { try { if (recorder.state === 'recording') recorder.stop(); } catch {} }, 120);
    };

    recorder.start(500);
    await audioContext.resume().catch(() => undefined);
    visual.currentTime = 0;
    audio.currentTime = 0;
    await Promise.all([visual.play(), audio.play()]);
    visual.onended = stop;
    audio.onended = stop;
    window.setTimeout(stop, Math.max(renderedAudio.durationSeconds, visual.duration || 0, 1) * 1000 + 600);
    const blob = await done;
    videoCapture.stop();
    await audioContext.close().catch(() => undefined);
    URL.revokeObjectURL(visualUrl);
    URL.revokeObjectURL(audioUrl);
    if (blob.size < 1000) throw new Error(`rendered_video_empty:${blob.size}`);
    return {
      blob,
      mimeType: blob.type || recorder.mimeType || mimeType || 'video/webm',
      durationSeconds: renderedAudio.durationSeconds,
      referenceIncluded: renderedAudio.referenceIncluded,
    };
  }
}
