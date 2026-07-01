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
  mimeTypes: { camera?: string; canvas?: string; voice?: string; safePublish?: string };
  diagnostics: { cameraChunks: number; canvasChunks: number; voiceChunks: number; safePublishChunks: number; hasMicrophoneTrack: boolean; hasCanvasVideoTrack: boolean };
};

type RecorderHandle = { recorder: MediaRecorder; chunks: Blob[]; mimeType: string; start: () => void; stop: () => Promise<Blob | null> };
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
  const candidates = isSafariLike() ? safariCandidates : defaultCandidates;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function audioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
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
    start: () => recorder.start(500),
    stop: () => new Promise((resolve) => {
      if (recorder.state === 'inactive') return resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType || undefined }) : null);
      recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType || undefined }) : null);
      try { recorder.requestData(); } catch {}
      window.setTimeout(() => { try { if (recorder.state !== 'inactive') recorder.stop(); } catch { resolve(null); } }, 80);
    }),
  };
}

function waitForMediaReady(media: HTMLMediaElement, timeoutMs = 15000) {
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
    const fail = () => cleanup(() => reject(new Error('media_load_failed')));
    const timer = window.setTimeout(() => cleanup(() => reject(new Error('media_load_timeout'))), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('loadeddata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
}

function stopTracks(stream?: MediaStream | null) { stream?.getTracks().forEach((track) => { try { track.stop(); } catch {} }); }

function drawCover(ctx: CanvasRenderingContext2D, media: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  const vw = media.videoWidth || width;
  const vh = media.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const sw = width / scale;
  const sh = height / scale;
  ctx.drawImage(media, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, width, height);
}

function drawSelfie(ctx: CanvasRenderingContext2D, camera: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.translate(x + width, y);
  ctx.scale(-1, 1);
  drawCover(ctx, camera, 0, 0, width, height);
  ctx.restore();
}

function startCanvasDraw(args: { canvas: HTMLCanvasElement; camera: HTMLVideoElement; reference: HTMLVideoElement; frameRate: number }) {
  const ctx = args.canvas.getContext('2d');
  if (!ctx) return () => undefined;
  let frame = 0;
  let timer: number | null = null;
  const draw = () => {
    const width = args.canvas.width;
    const height = args.canvas.height;
    const half = width / 2;
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, width, height);
    if (args.reference.readyState >= 2 && args.reference.videoWidth > 0) {
      try { drawCover(ctx, args.reference, 0, 0, half, height); } catch {}
    }
    if (args.camera.readyState >= 2 && args.camera.videoWidth > 0) drawSelfie(ctx, args.camera, half, 0, half, height);
  };
  if (isSafariLike()) {
    timer = window.setInterval(draw, Math.max(30, Math.round(1000 / args.frameRate)));
    draw();
    return () => { if (timer) window.clearInterval(timer); };
  }
  let last = 0;
  const interval = 1000 / args.frameRate;
  const loop = (now = 0) => { if (now - last >= interval) { draw(); last = now; } frame = requestAnimationFrame(loop); };
  loop();
  return () => cancelAnimationFrame(frame);
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
  private safePublishRecorder: RecorderHandle | null = null;
  private referenceAttachment: MediaAttachment | null = null;
  private stopDrawing: (() => void) | null = null;
  private startedAt = 0;

  constructor(refs: DuetRecorderEngineRefs, options: DuetRecorderEngineOptions) {
    if (!options.referenceUrl) throw new Error('missing_reference_url');
    this.refs = refs;
    this.options = { ...options, width: options.width || 1280, height: options.height || 720, frameRate: options.frameRate || (isSafariLike() ? 24 : 30) };
  }

  async prepare() {
    const { camera, referenceVideo, canvas } = this.refs;
    canvas.width = this.options.width;
    canvas.height = this.options.height;
    try { this.referenceAttachment?.destroy(); } catch {}
    referenceVideo.crossOrigin = 'anonymous';
    referenceVideo.muted = true;
    referenceVideo.volume = 0;
    this.referenceAttachment = await attachMediaSource(referenceVideo, this.options.referenceUrl);
    await waitForMediaReady(referenceVideo);
    const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 48000 };
    if (this.options.audioDeviceId) audio.deviceId = { exact: this.options.audioDeviceId };
    this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.options.facingMode || 'user', width: { ideal: this.options.width }, height: { ideal: this.options.height }, frameRate: { ideal: this.options.frameRate, max: this.options.frameRate } }, audio });
    camera.srcObject = this.cameraStream;
    camera.muted = true;
    camera.playsInline = true;
    await waitForMediaReady(camera, 12000).catch(() => undefined);
    await camera.play().catch(() => undefined);
    this.microphoneStream = new MediaStream(this.cameraStream.getAudioTracks());
    referenceVideo.currentTime = 0;
  }

  async start() {
    const { camera, referenceVideo, canvas } = this.refs;
    if (!this.cameraStream || !this.microphoneStream) await this.prepare();
    if (!this.cameraStream || !this.microphoneStream) throw new Error('recorder_not_prepared');
    await referenceVideo.play();
    this.stopDrawing = startCanvasDraw({ canvas, camera, reference: referenceVideo, frameRate: this.options.frameRate });
    this.canvasStream = (canvas as CapturableCanvas).captureStream(this.options.frameRate);
    const canvasVideoTracks = this.canvasStream.getVideoTracks();
    const micAudioTracks = this.microphoneStream.getAudioTracks();
    this.cameraRecorder = createRecorder(new MediaStream(this.cameraStream.getVideoTracks()), 'video');
    this.canvasRecorder = createRecorder(new MediaStream(canvasVideoTracks), 'video');
    this.voiceRecorder = createRecorder(this.microphoneStream, 'audio');
    this.safePublishRecorder = createRecorder(new MediaStream([...canvasVideoTracks, ...micAudioTracks]), 'video');
    this.startedAt = Date.now();
    this.cameraRecorder?.start();
    this.canvasRecorder?.start();
    this.voiceRecorder?.start();
    this.safePublishRecorder?.start();
  }

  async stop(): Promise<DuetRecorderEngineResult> {
    const stoppedAt = Date.now();
    const { referenceVideo } = this.refs;
    try { referenceVideo.pause(); } catch {}
    try { this.stopDrawing?.(); } catch {}
    const [cameraBlob, canvasBlob, voiceBlob, safePublishBlob] = await Promise.all([
      this.cameraRecorder?.stop() ?? Promise.resolve(null),
      this.canvasRecorder?.stop() ?? Promise.resolve(null),
      this.voiceRecorder?.stop() ?? Promise.resolve(null),
      this.safePublishRecorder?.stop() ?? Promise.resolve(null),
    ]);
    const result: DuetRecorderEngineResult = {
      cameraBlob,
      canvasBlob,
      voiceBlob,
      safePublishBlob,
      startedAt: this.startedAt,
      stoppedAt,
      durationMs: Math.max(0, stoppedAt - this.startedAt),
      mimeTypes: { camera: this.cameraRecorder?.mimeType, canvas: this.canvasRecorder?.mimeType, voice: this.voiceRecorder?.mimeType, safePublish: this.safePublishRecorder?.mimeType },
      diagnostics: { cameraChunks: this.cameraRecorder?.chunks.length || 0, canvasChunks: this.canvasRecorder?.chunks.length || 0, voiceChunks: this.voiceRecorder?.chunks.length || 0, safePublishChunks: this.safePublishRecorder?.chunks.length || 0, hasMicrophoneTrack: Boolean(this.microphoneStream?.getAudioTracks().length), hasCanvasVideoTrack: Boolean(this.canvasStream?.getVideoTracks().length) },
    };
    this.cleanup();
    return result;
  }

  getMicrophoneStream() { return this.microphoneStream; }
  getCanvasStream() { return this.canvasStream; }

  cleanup() {
    try { this.refs.referenceVideo.pause(); } catch {}
    try { this.referenceAttachment?.destroy(); } catch {}
    try { this.refs.referenceVideo.removeAttribute('src'); this.refs.referenceVideo.load(); } catch {}
    try { this.stopDrawing?.(); } catch {}
    stopTracks(this.cameraStream);
    stopTracks(this.canvasStream);
    this.cameraStream = null;
    this.microphoneStream = null;
    this.canvasStream = null;
    this.cameraRecorder = null;
    this.canvasRecorder = null;
    this.voiceRecorder = null;
    this.safePublishRecorder = null;
    this.referenceAttachment = null;
    this.stopDrawing = null;
  }
}
