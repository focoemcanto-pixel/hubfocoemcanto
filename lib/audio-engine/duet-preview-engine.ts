import { attachMediaSource } from '@/lib/media/hls-client';
import { DuetAudioEngine, type DuetAudioEngineSnapshot, type DuetFaderValues } from './duet-audio-engine';

export type DuetPreviewEngineRefs = { visual: HTMLVideoElement; voice: HTMLAudioElement; reference: HTMLAudioElement | HTMLVideoElement };
export type DuetPreviewEngineOptions = { visualBlob: Blob; voiceBlob: Blob; referenceUrl: string; initialFaders?: Partial<DuetFaderValues>; preGains?: Partial<{ voice: number; reference: number }>; referenceOffsetMs?: number };
export type DuetPreviewDiagnostic = DuetAudioEngineSnapshot & { visualTime: number; voiceTime: number; referenceTime: number; visualPaused: boolean; voicePaused: boolean; referencePaused: boolean; voiceDriftMs: number; referenceDriftMs: number; referenceOffsetMs: number; referenceMode: 'timeline-buffer' | 'media-element' };
type MediaAttachment = { destroy: () => void };

const VOICE_CAPTURE_COMPENSATION_MS = 35;

function waitForMediaReady(media: HTMLMediaElement, timeoutMs = 15000) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    let done = false;
    const cleanup = (fn: () => void) => { if (done) return; done = true; window.clearTimeout(timer); media.removeEventListener('loadedmetadata', ok); media.removeEventListener('loadeddata', ok); media.removeEventListener('canplay', ok); media.removeEventListener('error', fail); fn(); };
    const ok = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('preview_media_load_failed')));
    const timer = window.setTimeout(() => cleanup(() => reject(new Error('preview_media_timeout'))), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true }); media.addEventListener('loadeddata', ok, { once: true }); media.addEventListener('canplay', ok, { once: true }); media.addEventListener('error', fail, { once: true });
  });
}
function waitForSeek(media: HTMLMediaElement, timeoutMs = 1200) { return new Promise<void>((resolve) => { if (!media.seeking) return resolve(); let done = false; const cleanup = () => { if (done) return; done = true; window.clearTimeout(timer); media.removeEventListener('seeked', cleanup); resolve(); }; const timer = window.setTimeout(cleanup, timeoutMs); media.addEventListener('seeked', cleanup, { once: true }); }); }
function withFullMedia(url: string) { if (!url) return url; const separator = url.includes('?') ? '&' : '?'; return `${url}${separator}full=1`; }
async function decodeBlob(context: AudioContext, blob: Blob) { const arrayBuffer = await blob.arrayBuffer(); return context.decodeAudioData(arrayBuffer.slice(0)); }
async function decodeReferenceBuffer(context: AudioContext, url: string) { const response = await fetch(withFullMedia(url), { cache: 'reload' }); if (!response.ok) throw new Error(`reference_decode_fetch_failed:${response.status}`); const arrayBuffer = await response.arrayBuffer(); return context.decodeAudioData(arrayBuffer.slice(0)); }
function prepareGraphMedia(media: HTMLMediaElement) { media.preload = 'auto'; media.volume = 1; media.muted = false; media.playbackRate = 1; if ('playsInline' in media) (media as HTMLVideoElement).playsInline = true; }
function clampOffset(value: number) { return Math.max(-900, Math.min(900, Number.isFinite(value) ? value : 0)); }
function compensatedOffset(value: number) { return clampOffset(value + VOICE_CAPTURE_COMPENSATION_MS); }
function resetPlaybackRate(media?: HTMLMediaElement | null) { if (!media) return; try { media.playbackRate = 1; } catch {} }

export class DuetPreviewEngine {
  readonly audio: DuetAudioEngine;
  private refs: DuetPreviewEngineRefs;
  private options: DuetPreviewEngineOptions;
  private visualUrl = '';
  private voiceUrl = '';
  private prepared = false;
  private playing = false;
  private referenceOffsetMs = 0;
  private delayedStartTimer: number | null = null;
  private driftFrame: number | null = null;
  private mediaDriftFrame: number | null = null;
  private timelineStartAt = 0;
  private timelineDuration = 0;
  private referenceStartedAt = 0;
  private voiceStartedAt = 0;
  private voiceBuffer: AudioBuffer | null = null;
  private referenceBuffer: AudioBuffer | null = null;
  private fallbackVoice: HTMLAudioElement | null = null;
  private fallbackReference: HTMLAudioElement | HTMLVideoElement | null = null;
  private fallbackReferenceAttachment: MediaAttachment | null = null;
  private referenceMode: 'timeline-buffer' | 'media-element' = 'timeline-buffer';
  constructor(refs: DuetPreviewEngineRefs, options: DuetPreviewEngineOptions) {
    this.refs = refs;
    this.options = options;
    this.referenceOffsetMs = clampOffset(options.referenceOffsetMs || 0);
    this.audio = new DuetAudioEngine({ latencyHint: 'interactive', sampleRate: 48000 });
    if (options.preGains) this.audio.setPreGains(options.preGains);
    if (options.initialFaders) this.audio.setFaders(options.initialFaders);
  }
  async prepare() {
    if (this.prepared) return;
    this.visualUrl = URL.createObjectURL(this.options.visualBlob);
    this.voiceUrl = URL.createObjectURL(this.options.voiceBlob);
    const { visual, voice, reference } = this.refs;
    visual.src = this.visualUrl; visual.preload = 'auto'; visual.playsInline = true; visual.muted = true; visual.volume = 0;
    voice.src = this.voiceUrl;
    await Promise.all([waitForMediaReady(visual), waitForMediaReady(voice).catch(() => undefined)]);
    this.voiceBuffer = await decodeBlob(this.audio.context, this.options.voiceBlob);
    this.audio.connectVoiceBuffer(this.voiceBuffer);
    try {
      this.referenceBuffer = await decodeReferenceBuffer(this.audio.context, this.options.referenceUrl);
      this.audio.connectReferenceBuffer(this.referenceBuffer);
      this.referenceMode = 'timeline-buffer';
      try { voice.pause(); voice.removeAttribute('src'); voice.load(); } catch {}
      try { reference.pause(); reference.removeAttribute('src'); reference.load(); } catch {}
    } catch {
      this.fallbackVoice = document.createElement('audio');
      this.fallbackReference = document.createElement('video');
      prepareGraphMedia(this.fallbackVoice); prepareGraphMedia(this.fallbackReference);
      this.fallbackVoice.src = this.voiceUrl;
      this.fallbackReference.crossOrigin = 'anonymous';
      this.fallbackReferenceAttachment = await attachMediaSource(this.fallbackReference as HTMLVideoElement, this.options.referenceUrl);
      await Promise.all([waitForMediaReady(this.fallbackVoice), waitForMediaReady(this.fallbackReference)]);
      this.audio.connectVoiceElement(this.fallbackVoice);
      this.audio.connectReferenceElement(this.fallbackReference);
      this.referenceMode = 'media-element';
    }
    this.timelineDuration = Math.max(this.refs.visual.duration || 0, this.voiceBuffer?.duration || 0, this.referenceBuffer?.duration || this.fallbackReference?.duration || 0);
    this.prepared = true;
  }
  async play() {
    await this.prepare(); this.pause(); await this.audio.resume();
    if (this.referenceMode === 'media-element') return this.playMediaElementFallback();
    const { visual } = this.refs; const faders = this.audio.getFaders(); const offsetSeconds = compensatedOffset(this.referenceOffsetMs) / 1000; const startDelaySeconds = 0.09; const startAt = this.audio.context.currentTime + startDelaySeconds;
    try { visual.pause(); visual.currentTime = 0; } catch {}; await waitForSeek(visual); visual.muted = true; visual.volume = 0;
    this.audio.stopVoiceBuffer(); this.audio.stopReferenceBuffer(); this.playing = true; this.timelineStartAt = startAt; this.voiceStartedAt = startAt;
    if (faders.voice > 0) this.audio.startVoiceBufferAt(startAt, 0);
    if (faders.reference > 0) { if (offsetSeconds >= 0) { this.referenceStartedAt = startAt + offsetSeconds; this.audio.startReferenceBufferAt(startAt + offsetSeconds, 0); } else { this.referenceStartedAt = startAt; this.audio.startReferenceBufferAt(startAt, Math.abs(offsetSeconds)); } }
    this.delayedStartTimer = window.setTimeout(() => { if (!this.playing) return; visual.play().catch(() => undefined); this.startVisualClockGuard(); }, Math.round(startDelaySeconds * 1000));
  }
  pause() {
    this.playing = false;
    this.clearDelayedStart();
    this.stopVisualClockGuard();
    this.stopMediaElementClockGuard();
    this.audio.stopVoiceBuffer();
    this.audio.stopReferenceBuffer();
    try { this.refs.visual.pause(); } catch {}
    try { this.refs.voice.pause(); } catch {}
    try { this.refs.reference.pause(); } catch {}
    try { this.fallbackVoice?.pause(); } catch {}
    try { this.fallbackReference?.pause(); } catch {}
    resetPlaybackRate(this.fallbackVoice);
    resetPlaybackRate(this.fallbackReference);
  }
  setReferenceOffsetMs(value: number) { this.referenceOffsetMs = clampOffset(value); }
  setFaders(values: Partial<DuetFaderValues>) { this.audio.setFaders(values); if (!this.playing || this.referenceMode !== 'media-element') return; const faders = this.audio.getFaders(); if (this.fallbackVoice) this.syncTrackPlaybackState(this.fallbackVoice, faders.voice); if (this.fallbackReference) this.syncTrackPlaybackState(this.fallbackReference, faders.reference); }
  autoMix() { this.setFaders({ voice: 110, reference: 70 }); }
  getFaders() { return this.audio.getFaders(); }
  getDiagnostic(): DuetPreviewDiagnostic { const snapshot = this.audio.getSnapshot(); const visualTime = this.refs.visual.currentTime || 0; const now = this.audio.context.currentTime; const timelineTime = this.playing && this.timelineStartAt ? Math.max(0, now - this.timelineStartAt) : 0; const voiceMedia = this.fallbackVoice || this.refs.voice; const referenceMedia = this.fallbackReference || this.refs.reference; const voiceTime = this.referenceMode === 'timeline-buffer' ? timelineTime : voiceMedia.currentTime || 0; const referenceTime = this.referenceMode === 'timeline-buffer' ? Math.max(0, now - this.referenceStartedAt) : referenceMedia.currentTime || 0; return { ...snapshot, visualTime, voiceTime, referenceTime, visualPaused: this.refs.visual.paused, voicePaused: this.referenceMode === 'timeline-buffer' ? !this.playing : voiceMedia.paused, referencePaused: this.referenceMode === 'timeline-buffer' ? !this.playing || now < this.referenceStartedAt : referenceMedia.paused, voiceDriftMs: Math.round((voiceTime - visualTime) * 1000), referenceDriftMs: Math.round((referenceTime - visualTime) * 1000), referenceOffsetMs: this.referenceOffsetMs, referenceMode: this.referenceMode }; }
  async close() { this.pause(); try { this.fallbackReferenceAttachment?.destroy(); } catch {}; await this.audio.close(); if (this.visualUrl) URL.revokeObjectURL(this.visualUrl); if (this.voiceUrl) URL.revokeObjectURL(this.voiceUrl); this.visualUrl = ''; this.voiceUrl = ''; this.fallbackVoice = null; this.fallbackReference = null; this.fallbackReferenceAttachment = null; this.prepared = false; }
  private async playMediaElementFallback() {
    const visual = this.refs.visual; const voice = this.fallbackVoice || this.refs.voice; const reference = this.fallbackReference || this.refs.reference; const faders = this.audio.getFaders(); const offsetSeconds = compensatedOffset(this.referenceOffsetMs) / 1000;
    try { visual.pause(); voice.pause(); reference.pause(); } catch {}; try { visual.currentTime = 0; } catch {}; try { voice.currentTime = 0; } catch {}; try { reference.currentTime = offsetSeconds < 0 ? Math.abs(offsetSeconds) : 0; } catch {};
    resetPlaybackRate(voice); resetPlaybackRate(reference);
    await Promise.all([waitForSeek(visual), waitForSeek(voice), waitForSeek(reference)]);
    visual.muted = true; visual.volume = 0; voice.volume = 1; voice.muted = false; reference.volume = 1; reference.muted = false;
    this.playing = true; this.timelineStartAt = this.audio.context.currentTime + 0.08; this.voiceStartedAt = this.timelineStartAt; this.referenceStartedAt = offsetSeconds >= 0 ? this.timelineStartAt + offsetSeconds : this.timelineStartAt; this.audio.stopReferenceBuffer();
    const start = () => { if (!this.playing) return; void visual.play().catch(() => undefined); if (faders.voice > 0) void voice.play().catch(() => undefined); if (offsetSeconds <= 0 && faders.reference > 0) void reference.play().catch(() => undefined); this.startVisualClockGuard(); this.startMediaElementClockGuard(); };
    this.delayedStartTimer = window.setTimeout(() => { start(); if (offsetSeconds > 0 && faders.reference > 0) window.setTimeout(() => { if (!this.playing) return; reference.play().catch(() => undefined); }, Math.round(offsetSeconds * 1000)); }, 80);
  }
  private startVisualClockGuard() { this.stopVisualClockGuard(); const tick = () => { if (!this.playing) return; const elapsed = Math.max(0, this.audio.context.currentTime - this.timelineStartAt); if (this.timelineDuration && elapsed > this.timelineDuration + 0.25) { this.pause(); return; } const drift = (this.refs.visual.currentTime || 0) - elapsed; if (Math.abs(drift) > 0.12 && elapsed < (this.refs.visual.duration || Number.POSITIVE_INFINITY)) { try { this.refs.visual.currentTime = elapsed; } catch {} } this.driftFrame = requestAnimationFrame(tick); }; this.driftFrame = requestAnimationFrame(tick); }
  private startMediaElementClockGuard() {
    this.stopMediaElementClockGuard();
    let lastHardSyncAt = 0;
    const tick = () => {
      if (!this.playing || this.referenceMode !== 'media-element') return;
      const elapsed = Math.max(0, this.audio.context.currentTime - this.timelineStartAt);
      const effectiveOffsetSeconds = compensatedOffset(this.referenceOffsetMs) / 1000;
      const targetVoice = elapsed;
      const targetReference = Math.max(0, elapsed - effectiveOffsetSeconds);
      const voice = this.fallbackVoice;
      const reference = this.fallbackReference;
      const now = performance.now();

      const gentlyCorrect = (media: HTMLMediaElement | null, target: number) => {
        if (!media || media.paused) return;
        const drift = (media.currentTime || 0) - target;
        const absoluteDrift = Math.abs(drift);
        if (absoluteDrift > 0.42 && now - lastHardSyncAt > 1200) {
          try { media.currentTime = target; } catch {}
          resetPlaybackRate(media);
          lastHardSyncAt = now;
          return;
        }
        if (absoluteDrift > 0.09) {
          try { media.playbackRate = drift > 0 ? 0.97 : 1.03; } catch {}
        } else if (absoluteDrift < 0.035) {
          resetPlaybackRate(media);
        }
      };

      gentlyCorrect(voice, targetVoice);
      gentlyCorrect(reference, targetReference);
      this.mediaDriftFrame = requestAnimationFrame(tick);
    };
    this.mediaDriftFrame = requestAnimationFrame(tick);
  }
  private stopVisualClockGuard() { if (this.driftFrame) cancelAnimationFrame(this.driftFrame); this.driftFrame = null; }
  private stopMediaElementClockGuard() { if (this.mediaDriftFrame) cancelAnimationFrame(this.mediaDriftFrame); this.mediaDriftFrame = null; resetPlaybackRate(this.fallbackVoice); resetPlaybackRate(this.fallbackReference); }
  private syncTrackPlaybackState(media: HTMLMediaElement, faderValue: number) { media.volume = 1; media.muted = false; if (faderValue <= 0) { try { media.pause(); } catch {}; return; } if (media.paused && !this.refs.visual.paused) { try { media.currentTime = this.refs.visual.currentTime || 0; } catch {}; resetPlaybackRate(media); media.play().catch(() => undefined); } }
  private clearDelayedStart() { if (this.delayedStartTimer) window.clearTimeout(this.delayedStartTimer); this.delayedStartTimer = null; }
}
