'use client';

import { useMemo, useRef, useState } from 'react';
import { DuetBufferEngine, type VoicePreset } from './duet-buffer-engine';
import { loadDuetBufferEngine, toggleDuetBufferPlayback } from './duet-engine-loader';
import { clampLatencyMs } from './duet-latency';

type Step = 'intro' | 'loading' | 'countdown' | 'recording' | 'review' | 'caption' | 'posted' | 'rendering';

function isSafariLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

function mime(videoOnly = false, audioOnly = false) {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const list = audioOnly ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] : videoOnly ? ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'] : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return list.find((type) => MediaRecorder.isTypeSupported(type));
}

function options(type?: string, audioOnly = false): MediaRecorderOptions {
  const result: MediaRecorderOptions = {};
  if (type) result.mimeType = type;
  if (!audioOnly) result.videoBitsPerSecond = isSafariLike() ? 1600000 : 5200000;
  result.audioBitsPerSecond = audioOnly ? 128000 : 160000;
  return result;
}

function bufferedAhead(media: HTMLMediaElement) {
  try {
    const current = media.currentTime || 0;
    for (let index = 0; index < media.buffered.length; index += 1) {
      const start = media.buffered.start(index);
      const end = media.buffered.end(index);
      if (current >= start && current <= end) return Math.max(0, end - current);
      if (current < start) return Math.max(0, end - start);
    }
  } catch {}
  return 0;
}

function targetBufferSeconds(media: HTMLMediaElement) {
  const duration = Number.isFinite(media.duration) ? media.duration : 0;
  if (!duration || duration < 12) return 4;
  return Math.min(12, Math.max(6, duration * 0.22));
}

function waitReady(media: HTMLMediaElement) {
  return new Promise<void>((resolve, reject) => {
    const enough = () => {
      if (media.readyState < (isSafariLike() ? 3 : 2)) return false;
      const duration = Number.isFinite(media.duration) ? media.duration : 0;
      if (!duration || duration <= 8) return true;
      return bufferedAhead(media) >= targetBufferSeconds(media) || media.readyState >= 4;
    };
    if (enough()) return resolve();
    let settled = false;
    const timeout = window.setTimeout(() => cleanup(() => resolve()), isSafariLike() ? 30000 : 24000);
    const ok = () => { if (enough()) cleanup(resolve); };
    const canPlayThrough = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('media_error')));
    const cleanup = (cb: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      media.removeEventListener('loadedmetadata', ok);
      media.removeEventListener('canplay', ok);
      media.removeEventListener('canplaythrough', canPlayThrough);
      media.removeEventListener('progress', ok);
      media.removeEventListener('loadeddata', ok);
      media.removeEventListener('suspend', ok);
      media.removeEventListener('error', fail);
      cb();
    };
    media.addEventListener('loadedmetadata', ok);
    media.addEventListener('loadeddata', ok);
    media.addEventListener('canplay', ok);
    media.addEventListener('canplaythrough', canPlayThrough, { once: true });
    media.addEventListener('progress', ok);
    media.addEventListener('suspend', ok);
    media.addEventListener('error', fail, { once: true });
  });
}

function drawCover(ctx: CanvasRenderingContext2D, media: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  const vw = media.videoWidth || width;
  const vh = media.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const sw = width / scale;
  const sh = height / scale;
  ctx.drawImage(media, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, width, height);
}

function drawCoverUnmirroredSelfie(ctx: CanvasRenderingContext2D, media: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.translate(x + width, y);
  ctx.scale(-1, 1);
  drawCover(ctx, media, 0, 0, width, height);
  ctx.restore();
}

export function useDuetBufferRecorder(referenceSource: string, lessonSlug: string) {
  const [step, setStep] = useState<Step>('intro');
  const [count, setCount] = useState(3);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [visualUrl, setVisualUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [voiceVolume, setVoiceVolumeState] = useState(100);
  const [referenceVolume, setReferenceVolumeState] = useState(100);
  const [preset, setPresetState] = useState<VoicePreset>('natural');
  const [latencyMs, setLatencyMsState] = useState(70);
  const [noiseReduction, setNoiseReductionState] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referenceStatus, setReferenceStatus] = useState('');
  const [lowDataMode, setLowDataMode] = useState(false);

  const settingsRef = useRef({ voiceVolume: 100, referenceVolume: 100, preset: 'natural' as VoicePreset, latencyMs: 70, noiseReduction: false });
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const referenceRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<DuetBufferEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const drawRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const visualRecorderRef = useRef<MediaRecorder | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const referenceRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const visualChunksRef = useRef<Blob[]>([]);
  const micChunksRef = useRef<Blob[]>([]);
  const referenceChunksRef = useRef<Blob[]>([]);
  const finalBlobRef = useRef<Blob | null>(null);
  const visualBlobRef = useRef<Blob | null>(null);
  const voiceBlobRef = useRef<Blob | null>(null);
  const referenceBlobRef = useRef<Blob | null>(null);

  const canRecord = useMemo(() => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, []);
  const canLiveEdit = Boolean(visualUrl && audioReady);
  const settings = () => settingsRef.current;

  function setVoiceVolume(value: number) { const next = Math.max(0, Math.min(100, value)); settingsRef.current = { ...settingsRef.current, voiceVolume: next }; setVoiceVolumeState(next); engineRef.current?.applySettings(); }
  function setReferenceVolume(value: number) { const next = Math.max(0, Math.min(100, value)); settingsRef.current = { ...settingsRef.current, referenceVolume: next }; setReferenceVolumeState(next); engineRef.current?.applySettings(); }
  function setPreset(value: VoicePreset) { settingsRef.current = { ...settingsRef.current, preset: value }; setPresetState(value); engineRef.current?.applySettings(); }
  function setLatencyMs(value: number) { const next = clampLatencyMs(value); settingsRef.current = { ...settingsRef.current, latencyMs: next }; setLatencyMsState(next); }
  function setNoiseReduction(value: boolean) { settingsRef.current = { ...settingsRef.current, noiseReduction: value }; setNoiseReductionState(value); }
  function clearDraw() { if (drawRef.current) cancelAnimationFrame(drawRef.current); if (timerRef.current) window.clearInterval(timerRef.current); drawRef.current = null; timerRef.current = null; }
  function cleanup() { clearDraw(); engineRef.current?.destroy(); engineRef.current = null; setAudioReady(false); setIsPlaying(false); setReferenceStatus(''); streamRef.current?.getTracks().forEach((track) => track.stop()); audioCtxRef.current?.close().catch(() => undefined); }

  function drawFrame() {
    const canvas = canvasRef.current, camera = cameraRef.current, reference = referenceRef.current;
    if (!canvas || !camera || !reference) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height, half = w / 2;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);
    if (reference.readyState >= 2 && reference.videoWidth > 0) drawCover(ctx, reference, 0, 0, half, h);
    if (camera.readyState >= 2 && camera.videoWidth > 0) drawCoverUnmirroredSelfie(ctx, camera, half, 0, half, h);
  }

  function startDraw() {
    clearDraw();
    if (isSafariLike()) {
      timerRef.current = window.setInterval(drawFrame, 42);
      drawFrame();
      return;
    }
    let last = 0;
    const frameMs = 1000 / (lowDataMode ? 24 : 30);
    const draw = (now = 0) => {
      if (now - last >= frameMs) { drawFrame(); last = now; }
      drawRef.current = requestAnimationFrame(draw);
    };
    draw();
  }

  function attachReferenceStallGuard() {
    const reference = referenceRef.current;
    if (!reference) return () => undefined;
    let stallCount = 0;
    const recovering = () => {
      stallCount += 1;
      if (stallCount >= 2) setLowDataMode(true);
      setReferenceStatus('Conexão oscilando. Ajustando reprodução da referência...');
      reference.playbackRate = 0.98;
      reference.play().catch(() => undefined);
    };
    const recovered = () => {
      if (!reference.paused && reference.readyState >= 3) setReferenceStatus('');
    };
    reference.addEventListener('waiting', recovering);
    reference.addEventListener('stalled', recovering);
    reference.addEventListener('suspend', recovered);
    reference.addEventListener('canplay', recovered);
    reference.addEventListener('playing', recovered);
    return () => {
      reference.removeEventListener('waiting', recovering);
      reference.removeEventListener('stalled', recovering);
      reference.removeEventListener('suspend', recovered);
      reference.removeEventListener('canplay', recovered);
      reference.removeEventListener('playing', recovered);
      reference.playbackRate = 1;
    };
  }

  async function prepareEngine(voiceBlob: Blob, referenceBlob?: Blob | null) {
    if (!referenceSource && !referenceBlob) return;
    const engine = await loadDuetBufferEngine({ voiceBlob, referenceSource, referenceBlob, previewVideo: previewRef.current, settings, previous: engineRef.current });
    engineRef.current = engine;
    setAudioReady(true);
  }

  async function togglePlayback() { const playing = await toggleDuetBufferPlayback({ engine: engineRef.current, video: previewRef.current, canLiveEdit }); setIsPlaying(Boolean(playing)); }
  function applySettings() { settingsRef.current = { voiceVolume, referenceVolume, preset, latencyMs, noiseReduction }; engineRef.current?.applySettings(); }

  return { step, setStep, count, setCount, previewUrl, setPreviewUrl, visualUrl, setVisualUrl, error, setError, voiceVolume, setVoiceVolume, referenceVolume, setReferenceVolume, preset, setPreset, latencyMs, setLatencyMs, noiseReduction, setNoiseReduction, audioReady, setAudioReady, isPlaying, setIsPlaying, isSubmitting, setIsSubmitting, referenceStatus, setReferenceStatus, lowDataMode, setLowDataMode, cameraRef, referenceRef, previewRef, canvasRef, engineRef, chunksRef, visualChunksRef, micChunksRef, referenceChunksRef, mediaRecorderRef, visualRecorderRef, micRecorderRef, referenceRecorderRef, finalBlobRef, visualBlobRef, voiceBlobRef, referenceBlobRef, canRecord, canLiveEdit, settings, cleanup, waitReady, drawFrame, startDraw, clearDraw, applySettings, prepareEngine, togglePlayback, options, mime, isSafariLike, streamRef, audioCtxRef, referenceSource, lessonSlug, attachReferenceStallGuard, bufferedAhead, targetBufferSeconds };
}
