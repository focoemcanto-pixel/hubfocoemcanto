import { attachMediaSource } from '@/lib/media/hls-client';

export type DuetRecorderEngineRefs = {
  camera: HTMLVideoElement;
  referenceVideo: HTMLVideoElement;
  canvas: HTMLCanvasElement;
};

export type DuetRecorderEngineOptions = {
  referenceUrl: string;
  width?: number;
  height?: number;
  frameRate?: number;
  audioDeviceId?: string | null;
  facingMode?: 'user' | 'environment';
};

export type DuetRecorderEngineResult = {
  cameraBlob: Blob | null;
  canvasBlob: Blob | null;
  voiceBlob: Blob | null;
  safePublishBlob?: Blob | null;
  startedAt: number;
  stoppedAt: number;
  durationMs: number;
  posterDataUrl?: string | null;
  markerOffsetMs?: number;
  mimeTypes: { camera?: string; canvas?: string; voice?: string; safePublish?: string };
  diagnostics: { cameraChunks: number; canvasChunks: number; voiceChunks: number; safePublishChunks: number; hasMicrophoneTrack: boolean; hasCanvasVideoTrack: boolean };
};

type RecorderHandle = { recorder: MediaRecorder; chunks: Blob[]; mimeType: string; start: () => void; stop: () => Promise<Blob | null> };
type PcmRecorderHandle = { chunks: Float32Array[]; mimeType: string; start: () => Promise<void>; stop: () => Promise<Blob | null>; close: () => Promise<void> };
type CapturableCanvas = HTMLCanvasElement & { captureStream: (frameRate?: number) => MediaStream };
type MediaAttachment = { destroy: () => void };

function isSafariLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

function videoMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const safariCandidates = ['video/mp4', 'video/mp4;codecs=h264,aac', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'];
  const defaultCandidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return (isSafariLike() ? safariCandidates : defaultCandidates).find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function audioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function createRecorder(stream: MediaStream, kind: 'video' | 'audio'): RecorderHandle | null {
  if (typeof MediaRecorder === 'undefined') throw new Error('media_recorder_missing');
  if (!stream.getTracks().length) return null;
  const mimeType = kind === 'audio' ? audioMimeType() : videoMimeType();
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), ...(kind === 'video' ? { videoBitsPerSecond: isSafariLike() ? 2500000 : 5200000, audioBitsPerSecond: 192000 } : { audioBitsPerSecond: 192000 }) });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
  return {
    recorder,
    chunks,
    mimeType: recorder.mimeType || mimeType,
    start: () => recorder.start(kind === 'audio' ? 1000 : 500),
    stop: () => new Promise((resolve) => {
      if (recorder.state === 'inactive') return resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType || undefined }) : null);
      recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType || undefined }) : null);
      try { recorder.requestData(); } catch {}
      window.setTimeout(() => { try { if (recorder.state !== 'inactive') recorder.stop(); } catch { resolve(null); } }, 100);
    }),
  };
}

function encodeMonoWav(chunks: Float32Array[], sampleRate: number) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function createSafariPcmRecorder(stream: MediaStream): PcmRecorderHandle {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('audio_context_missing');
  const context = new AudioCtx({ latencyHint: 'interactive' });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentGain = context.createGain();
  const chunks: Float32Array[] = [];
  let recording = false;
  silentGain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    if (!recording) return;
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
  };
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);
  return {
    chunks,
    mimeType: 'audio/wav',
    start: async () => { await context.resume(); recording = true; },
    stop: async () => {
      recording = false;
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      return chunks.length ? encodeMonoWav(chunks, context.sampleRate) : null;
    },
    close: async () => {
      recording = false;
      try { source.disconnect(); } catch {}
      try { processor.disconnect(); } catch {}
      try { silentGain.disconnect(); } catch {}
      processor.onaudioprocess = null;
      await context.close().catch(() => undefined);
    },
  };
}

function waitForMediaReady(media: HTMLMediaElement, timeoutMs = 15000) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    let done = false;
    const cleanup = (fn: () => void) => { if (done) return; done = true; window.clearTimeout(timer); media.removeEventListener('loadedmetadata', ok); media.removeEventListener('loadeddata', ok); media.removeEventListener('canplay', ok); media.removeEventListener('error', fail); fn(); };
    const ok = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('media_load_failed')));
    const timer = window.setTimeout(() => cleanup(() => reject(new Error('media_load_timeout'))), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true }); media.addEventListener('loadeddata', ok, { once: true }); media.addEventListener('canplay', ok, { once: true }); media.addEventListener('error', fail, { once: true });
  });
}

function stopTracks(stream?: MediaStream | null) { stream?.getTracks().forEach((track) => { try { track.stop(); } catch {} }); }

function drawCover(ctx: CanvasRenderingContext2D, media: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  const vw = media.videoWidth || width; const vh = media.videoHeight || height; const scale = Math.max(width / vw, height / vh); const sw = width / scale; const sh = height / scale;
  ctx.drawImage(media, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, width, height);
}
function drawSelfie(ctx: CanvasRenderingContext2D, camera: HTMLVideoElement, x: number, y: number, width: number, height: number) { ctx.save(); ctx.translate(x + width, y); ctx.scale(-1, 1); drawCover(ctx, camera, 0, 0, width, height); ctx.restore(); }
function drawDuetFrame(canvas: HTMLCanvasElement, camera: HTMLVideoElement, reference: HTMLVideoElement) {
  const ctx = canvas.getContext('2d'); if (!ctx) return; const width = canvas.width; const height = canvas.height; const half = width / 2;
  ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, width, height);
  if (reference.readyState >= 2 && reference.videoWidth > 0) { try { drawCover(ctx, reference, 0, 0, half, height); } catch {} }
  if (camera.readyState >= 2 && camera.videoWidth > 0) { try { drawSelfie(ctx, camera, half, 0, half, height); } catch {} }
}
function startCanvasDraw(args: { canvas: HTMLCanvasElement; camera: HTMLVideoElement; reference: HTMLVideoElement; frameRate: number }) {
  const draw = () => drawDuetFrame(args.canvas, args.camera, args.reference);
  if (isSafariLike()) { const timer = window.setInterval(draw, Math.max(30, Math.round(1000 / args.frameRate))); draw(); return () => window.clearInterval(timer); }
  let frame = 0; let last = 0; const interval = 1000 / args.frameRate;
  const loop = (now = 0) => { if (now - last >= interval) { draw(); last = now; } frame = requestAnimationFrame(loop); }; loop(); return () => cancelAnimationFrame(frame);
}

export class DuetRecorderEngine {
  private refs: DuetRecorderEngineRefs;
  private options: Required<Pick<DuetRecorderEngineOptions, 'width' | 'height' | 'frameRate'>> & DuetRecorderEngineOptions;
  private cameraStream: MediaStream | null = null;
  private microphoneStream: MediaStream | null = null;
  private canvasStream: MediaStream | null = null;
  private cameraRecorder: RecorderHandle | null = null;
  private canvasRecorder: RecorderHandle | null = null;
  private voiceRecorder: RecorderHandle | null = null;
  private pcmVoiceRecorder: PcmRecorderHandle | null = null;
  private referenceAttachment: MediaAttachment | null = null;
  private stopDrawing: (() => void) | null = null;
  private startedAt = 0;
  private posterDataUrl: string | null = null;

  constructor(refs: DuetRecorderEngineRefs, options: DuetRecorderEngineOptions) {
    if (!options.referenceUrl) throw new Error('missing_reference_url');
    this.refs = refs;
    this.options = { ...options, width: options.width || 1280, height: options.height || 720, frameRate: options.frameRate || (isSafariLike() ? 24 : 30) };
  }

  async prepare() {
    const { camera, referenceVideo, canvas } = this.refs;
    canvas.width = this.options.width; canvas.height = this.options.height;
    try { this.referenceAttachment?.destroy(); } catch {}
    referenceVideo.crossOrigin = 'anonymous'; referenceVideo.muted = true; referenceVideo.volume = 0; referenceVideo.playsInline = true;
    this.referenceAttachment = await attachMediaSource(referenceVideo, this.options.referenceUrl); await waitForMediaReady(referenceVideo);
    const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    if (this.options.audioDeviceId) audio.deviceId = { exact: this.options.audioDeviceId };
    this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.options.facingMode || 'user', width: { ideal: this.options.width }, height: { ideal: this.options.height }, frameRate: { ideal: this.options.frameRate, max: this.options.frameRate } }, audio });
    camera.srcObject = this.cameraStream; camera.muted = true; camera.playsInline = true;
    await waitForMediaReady(camera, 12000).catch(() => undefined); await camera.play().catch(() => undefined);
    const audioTrack = this.cameraStream.getAudioTracks()[0]; if (!audioTrack) throw new Error('microphone_track_missing');
    this.microphoneStream = new MediaStream([audioTrack]); referenceVideo.currentTime = 0; drawDuetFrame(canvas, camera, referenceVideo);
  }

  async start() {
    const { camera, referenceVideo, canvas } = this.refs;
    if (!this.cameraStream || !this.microphoneStream) await this.prepare();
    if (!this.cameraStream || !this.microphoneStream) throw new Error('recorder_not_prepared');
    try { referenceVideo.pause(); referenceVideo.currentTime = 0; } catch {}
    referenceVideo.muted = false; referenceVideo.volume = 1; referenceVideo.playsInline = true;
    this.stopDrawing = startCanvasDraw({ canvas, camera, reference: referenceVideo, frameRate: this.options.frameRate });
    this.canvasStream = (canvas as CapturableCanvas).captureStream(this.options.frameRate);
    const canvasVideoTracks = this.canvasStream.getVideoTracks();
    this.cameraRecorder = createRecorder(new MediaStream(this.cameraStream.getVideoTracks()), 'video');
    this.canvasRecorder = createRecorder(new MediaStream(canvasVideoTracks), 'video');
    if (isSafariLike()) this.pcmVoiceRecorder = createSafariPcmRecorder(this.microphoneStream);
    else this.voiceRecorder = createRecorder(this.microphoneStream, 'audio');
    this.startedAt = Date.now();
    this.cameraRecorder?.start(); this.canvasRecorder?.start();
    if (this.pcmVoiceRecorder) await this.pcmVoiceRecorder.start(); else this.voiceRecorder?.start();
    await referenceVideo.play().catch(() => undefined);
  }

  async stop(): Promise<DuetRecorderEngineResult> {
    const stoppedAt = Date.now(); const { camera, referenceVideo, canvas } = this.refs;
    try { drawDuetFrame(canvas, camera, referenceVideo); } catch {}
    try { this.posterDataUrl = canvas.toDataURL('image/jpeg', 0.82); } catch { this.posterDataUrl = null; }
    try { referenceVideo.pause(); } catch {} try { this.stopDrawing?.(); } catch {}
    const voicePromise = this.pcmVoiceRecorder ? this.pcmVoiceRecorder.stop() : this.voiceRecorder?.stop() ?? Promise.resolve(null);
    const [cameraBlob, canvasBlob, voiceBlob] = await Promise.all([this.cameraRecorder?.stop() ?? Promise.resolve(null), this.canvasRecorder?.stop() ?? Promise.resolve(null), voicePromise]);
    const result: DuetRecorderEngineResult = {
      cameraBlob, canvasBlob, voiceBlob, safePublishBlob: null, startedAt: this.startedAt, stoppedAt, durationMs: Math.max(0, stoppedAt - this.startedAt), posterDataUrl: this.posterDataUrl, markerOffsetMs: 0,
      mimeTypes: { camera: this.cameraRecorder?.mimeType, canvas: this.canvasRecorder?.mimeType, voice: this.pcmVoiceRecorder?.mimeType || this.voiceRecorder?.mimeType, safePublish: undefined },
      diagnostics: { cameraChunks: this.cameraRecorder?.chunks.length || 0, canvasChunks: this.canvasRecorder?.chunks.length || 0, voiceChunks: this.pcmVoiceRecorder?.chunks.length || this.voiceRecorder?.chunks.length || 0, safePublishChunks: 0, hasMicrophoneTrack: Boolean(this.microphoneStream?.getAudioTracks().length), hasCanvasVideoTrack: Boolean(this.canvasStream?.getVideoTracks().length) },
    };
    await this.pcmVoiceRecorder?.close().catch(() => undefined); this.cleanup({ preserveCanvas: true }); return result;
  }

  getMicrophoneStream() { return this.microphoneStream; }
  getCanvasStream() { return this.canvasStream; }

  cleanup(options: { preserveCanvas?: boolean } = {}) {
    try { this.refs.referenceVideo.pause(); } catch {} try { this.referenceAttachment?.destroy(); } catch {} try { this.refs.referenceVideo.removeAttribute('src'); this.refs.referenceVideo.load(); } catch {} try { this.stopDrawing?.(); } catch {}
    try { this.cameraRecorder?.recorder.state === 'recording' && this.cameraRecorder.recorder.stop(); } catch {} try { this.canvasRecorder?.recorder.state === 'recording' && this.canvasRecorder.recorder.stop(); } catch {} try { this.voiceRecorder?.recorder.state === 'recording' && this.voiceRecorder.recorder.stop(); } catch {}
    void this.pcmVoiceRecorder?.close().catch(() => undefined);
    stopTracks(this.cameraStream); if (this.microphoneStream !== this.cameraStream) stopTracks(this.microphoneStream); stopTracks(this.canvasStream);
    this.cameraStream = null; this.microphoneStream = null; this.canvasStream = null; this.cameraRecorder = null; this.canvasRecorder = null; this.voiceRecorder = null; this.pcmVoiceRecorder = null; this.referenceAttachment = null; this.stopDrawing = null;
    if (!options.preserveCanvas) { const ctx = this.refs.canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, this.refs.canvas.width, this.refs.canvas.height); }
  }
}
