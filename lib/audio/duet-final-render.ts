import type { VoicePreset } from './duet-buffer-engine';
import { clampLatencyMs } from './duet-latency';

export type FinalRenderSettings = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
  latencyMs?: number;
  noiseReduction?: boolean;
};

export type RenderArgs = {
  visualBlob: Blob;
  voiceBlob: Blob;
  referenceBlob?: Blob | null;
  referenceSource?: string | null;
  settings: FinalRenderSettings;
};

type CaptureVideo = HTMLVideoElement & { captureStream?: (fps?: number) => MediaStream; mozCaptureStream?: (fps?: number) => MediaStream };
const VOICE_RENDER_PRE_GAIN = 3.2;
const REFERENCE_RENDER_PRE_GAIN = 0.08;
function isSafariLike() { if (typeof navigator === 'undefined') return false; const ua = navigator.userAgent; return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua)); }
function recorderMimeType() { if (typeof MediaRecorder === 'undefined') return undefined; return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=h264,aac','video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'].find((type) => MediaRecorder.isTypeSupported(type)); }
function waitReady(media: HTMLMediaElement, timeoutMs = 22000) { return new Promise<void>((resolve, reject) => { if (media.readyState >= 2) return resolve(); let settled = false; const cleanup = (callback: () => void) => { if (settled) return; settled = true; window.clearTimeout(timeout); media.removeEventListener('loadedmetadata', ok); media.removeEventListener('loadeddata', ok); media.removeEventListener('canplay', ok); media.removeEventListener('error', fail); callback(); }; const ok = () => cleanup(resolve); const fail = () => cleanup(() => reject(new Error('media_element_load_failed'))); const timeout = window.setTimeout(() => cleanup(() => reject(new Error('media_timeout'))), timeoutMs); media.addEventListener('loadedmetadata', ok, { once: true }); media.addEventListener('loadeddata', ok, { once: true }); media.addEventListener('canplay', ok, { once: true }); media.addEventListener('error', fail, { once: true }); }); }
function makeCanvasVideoStream(visual: HTMLVideoElement) { const canvas = document.createElement('canvas'); canvas.width = isSafariLike() ? 960 : 1280; canvas.height = isSafariLike() ? 540 : 720; const ctx2d = canvas.getContext('2d'); if (!ctx2d) throw new Error('canvas_failed'); let frame = 0; let stopped = false; const paint = () => { ctx2d.fillStyle = '#050505'; ctx2d.fillRect(0, 0, canvas.width, canvas.height); try { ctx2d.drawImage(visual, 0, 0, canvas.width, canvas.height); } catch {} }; const draw = () => { if (stopped) return; paint(); frame = requestAnimationFrame(draw); }; paint(); draw(); return { stream: canvas.captureStream(isSafariLike() ? 24 : 30), stop: () => { stopped = true; cancelAnimationFrame(frame); } }; }
function makeDirectVideoStream(visual: HTMLVideoElement) { const video = visual as CaptureVideo; const capture = video.captureStream || video.mozCaptureStream; if (!capture) return null; try { const stream = capture.call(video, isSafariLike() ? 24 : 30); if (!stream.getVideoTracks().length) return null; return { stream, stop: () => stream.getTracks().forEach((track) => track.stop()) }; } catch { return null; } }
function createHiddenVideo(src: string, muted = true) { const video = document.createElement('video'); video.src = src; video.crossOrigin = 'anonymous'; video.playsInline = true; video.preload = 'auto'; video.muted = muted; video.volume = muted ? 0 : 1; return video; }
function createHiddenAudio(src: string) { const audio = document.createElement('audio'); audio.src = src; audio.crossOrigin = 'anonymous'; audio.preload = 'auto'; audio.volume = 1; return audio; }
function setupVoiceCompressor(node: DynamicsCompressorNode) { node.threshold.value = -22; node.knee.value = 18; node.ratio.value = 2.6; node.attack.value = 0.008; node.release.value = 0.16; }
function setupLimiter(node: DynamicsCompressorNode) { node.threshold.value = -3; node.knee.value = 0; node.ratio.value = 18; node.attack.value = 0.003; node.release.value = 0.08; }

export async function renderFinalDuetVideo({ visualBlob, voiceBlob, referenceBlob, referenceSource, settings }: RenderArgs) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('audio_context_missing');
  if (typeof MediaRecorder === 'undefined') throw new Error('media_recorder_missing');

  const visualUrl = URL.createObjectURL(visualBlob);
  const voiceUrl = URL.createObjectURL(voiceBlob);
  const referenceUrl = referenceSource || (referenceBlob ? URL.createObjectURL(referenceBlob) : '');
  if (!referenceUrl) throw new Error('reference_missing');

  const visual = createHiddenVideo(visualUrl, true);
  const voice = createHiddenAudio(voiceUrl);
  const reference = createHiddenVideo(referenceUrl, false);
  await Promise.all([waitReady(visual), waitReady(voice), waitReady(reference)]);

  const audioCtx = new AudioCtx({ latencyHint: 'playback', sampleRate: 48000 });
  const destination = audioCtx.createMediaStreamDestination();
  const voiceSource = audioCtx.createMediaElementSource(voice);
  const referenceSourceNode = audioCtx.createMediaElementSource(reference);
  const voiceCompressor = audioCtx.createDynamicsCompressor();
  const masterLimiter = audioCtx.createDynamicsCompressor();
  setupVoiceCompressor(voiceCompressor);
  setupLimiter(masterLimiter);
  const voiceGain = audioCtx.createGain();
  const referenceGain = audioCtx.createGain();
  const voiceDelay = audioCtx.createDelay(0.45);
  voiceDelay.delayTime.value = Math.max(0, Math.min(0.35, clampLatencyMs(settings.latencyMs || 0) / 1000));
  voiceGain.gain.value = normalizeVoiceTarget(settings.voiceVolume);
  referenceGain.gain.value = referenceTarget(settings.referenceVolume);
  voiceSource.connect(voiceDelay).connect(voiceCompressor).connect(voiceGain).connect(masterLimiter);
  referenceSourceNode.connect(referenceGain).connect(masterLimiter);
  masterLimiter.connect(destination);

  const audioTracks = destination.stream.getAudioTracks();
  if (!audioTracks.length) throw new Error('render_audio_track_missing_before_record');
  visual.currentTime = 0; voice.currentTime = 0; reference.currentTime = 0;
  const videoCapture = makeDirectVideoStream(visual) || makeCanvasVideoStream(visual);
  const outputStream = new MediaStream([...videoCapture.stream.getVideoTracks(), ...audioTracks]);
  if (!outputStream.getAudioTracks().length) throw new Error('render_output_audio_track_missing');
  const mimeType = recorderMimeType();
  const recorder = new MediaRecorder(outputStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: isSafariLike() ? 2500000 : 5200000, audioBitsPerSecond: 256000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
  const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' })); });
  let stopped = false;
  const cleanup = async () => { try { visual.pause(); } catch {} try { voice.pause(); } catch {} try { reference.pause(); } catch {} videoCapture.stop(); await audioCtx.close().catch(() => undefined); URL.revokeObjectURL(visualUrl); URL.revokeObjectURL(voiceUrl); if (!referenceSource && referenceUrl) URL.revokeObjectURL(referenceUrl); };
  const stop = () => { if (stopped) return; stopped = true; try { recorder.requestData(); } catch {} try { visual.pause(); } catch {} try { voice.pause(); } catch {} try { reference.pause(); } catch {} window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 160); };
  recorder.start(500);
  await audioCtx.resume().catch(() => undefined);
  await Promise.all([visual.play(), voice.play(), reference.play()]).catch((error) => { throw new Error(`media_play_failed:${error instanceof Error ? error.message : String(error)}`); });
  visual.onended = stop;
  const durations = [visual.duration, voice.duration, reference.duration].filter((value) => Number.isFinite(value) && value > 0);
  const maxDuration = Math.max(1, Math.min(...durations, 120));
  window.setTimeout(stop, maxDuration * 1000 + 550);
  const rendered = await done;
  await cleanup();
  if (rendered.size < 1000) throw new Error(`empty_rendered_duet:${rendered.size}`);
  return rendered;
}

export function normalizeVoiceTarget(volume: number) { return Math.max(0, Math.min(6, (volume / 100) * VOICE_RENDER_PRE_GAIN)); }
export function referenceTarget(volume: number) { return Math.max(0, Math.min(1, (volume / 100) * REFERENCE_RENDER_PRE_GAIN)); }
