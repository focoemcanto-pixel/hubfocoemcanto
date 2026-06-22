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
  if (!audioOnly) result.videoBitsPerSecond = isSafariLike() ? 2500000 : 5200000;
  result.audioBitsPerSecond = audioOnly ? 160000 : 192000;
  return result;
}

function waitReady(media: HTMLMediaElement) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    const timeout = window.setTimeout(() => cleanup(() => reject(new Error('timeout'))), 18000);
    const ok = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('media_error')));
    const cleanup = (cb: () => void) => {
      window.clearTimeout(timeout);
      media.removeEventListener('loadedmetadata', ok);
      media.removeEventListener('canplay', ok);
      media.removeEventListener('error', fail);
      cb();
    };
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
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

export function useDuetBufferRecorder(referenceSource: string, lessonSlug: string) {
  const [step, setStep] = useState<Step>('intro');
  const [count, setCount] = useState(3);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [visualUrl, setVisualUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [voiceVolume, setVoiceVolumeState] = useState(135);
  const [referenceVolume, setReferenceVolumeState] = useState(45);
  const [preset, setPresetState] = useState<VoicePreset>('worship');
  const [latencyMs, setLatencyMsState] = useState(70);
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const settingsRef = useRef({ voiceVolume: 135, referenceVolume: 45, preset: 'worship' as VoicePreset, latencyMs: 70 });
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

  function setVoiceVolume(value: number) {
    settingsRef.current = { ...settingsRef.current, voiceVolume: value };
    setVoiceVolumeState(value);
    engineRef.current?.applySettings();
  }

  function setReferenceVolume(value: number) {
    settingsRef.current = { ...settingsRef.current, referenceVolume: value };
    setReferenceVolumeState(value);
    engineRef.current?.applySettings();
  }

  function setPreset(value: VoicePreset) {
    settingsRef.current = { ...settingsRef.current, preset: value };
    setPresetState(value);
    engineRef.current?.applySettings();
  }

  function setLatencyMs(value: number) {
    const next = clampLatencyMs(value);
    settingsRef.current = { ...settingsRef.current, latencyMs: next };
    setLatencyMsState(next);
  }

  function clearDraw() {
    if (drawRef.current) cancelAnimationFrame(drawRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    drawRef.current = null;
    timerRef.current = null;
  }

  function cleanup() {
    clearDraw();
    engineRef.current?.destroy();
    engineRef.current = null;
    setAudioReady(false);
    setIsPlaying(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioCtxRef.current?.close().catch(() => undefined);
  }

  function drawFrame() {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const reference = referenceRef.current;
    if (!canvas || !camera || !reference) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const half = w / 2;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);
    if (reference.readyState >= 2 && reference.videoWidth > 0) drawCover(ctx, reference, 0, 0, half, h);
    if (camera.readyState >= 2 && camera.videoWidth > 0) drawCover(ctx, camera, half, 0, half, h);
  }

  function startDraw() {
    clearDraw();
    const draw = () => { drawFrame(); drawRef.current = requestAnimationFrame(draw); };
    if (isSafariLike()) {
      timerRef.current = window.setInterval(drawFrame, 33);
      drawFrame();
      return;
    }
    draw();
  }

  async function prepareEngine(voiceBlob: Blob, referenceBlob?: Blob | null) {
    if (!referenceSource && !referenceBlob) return;
    const engine = await loadDuetBufferEngine({
      voiceBlob,
      referenceSource,
      referenceBlob,
      previewVideo: previewRef.current,
      settings,
      previous: engineRef.current,
    });
    engineRef.current = engine;
    setAudioReady(true);
  }

  async function togglePlayback() {
    const playing = await toggleDuetBufferPlayback({
      engine: engineRef.current,
      video: previewRef.current,
      canLiveEdit,
    });
    setIsPlaying(Boolean(playing));
  }

  function applySettings() {
    settingsRef.current = { voiceVolume, referenceVolume, preset, latencyMs };
    engineRef.current?.applySettings();
  }

  return { step, setStep, count, setCount, previewUrl, setPreviewUrl, visualUrl, setVisualUrl, error, setError, voiceVolume, setVoiceVolume, referenceVolume, setReferenceVolume, preset, setPreset, latencyMs, setLatencyMs, audioReady, setAudioReady, isPlaying, setIsPlaying, isSubmitting, setIsSubmitting, cameraRef, referenceRef, previewRef, canvasRef, engineRef, chunksRef, visualChunksRef, micChunksRef, referenceChunksRef, mediaRecorderRef, visualRecorderRef, micRecorderRef, referenceRecorderRef, finalBlobRef, visualBlobRef, voiceBlobRef, referenceBlobRef, canRecord, canLiveEdit, settings, cleanup, waitReady, drawFrame, startDraw, clearDraw, applySettings, prepareEngine, togglePlayback, options, mime, isSafariLike, streamRef, audioCtxRef, referenceSource, lessonSlug };
}
