import { DuetAudioEngine, type DuetAudioEngineSnapshot, type DuetFaderValues } from './duet-audio-engine';

export type DuetPreviewEngineRefs = { visual: HTMLVideoElement; voice: HTMLAudioElement; reference: HTMLAudioElement | HTMLVideoElement };
export type DuetPreviewEngineOptions = { visualBlob: Blob; voiceBlob: Blob; referenceUrl: string; initialFaders?: Partial<DuetFaderValues>; preGains?: Partial<{ voice: number; reference: number }>; referenceOffsetMs?: number };
export type DuetPreviewDiagnostic = DuetAudioEngineSnapshot & { visualTime: number; voiceTime: number; referenceTime: number; visualPaused: boolean; voicePaused: boolean; referencePaused: boolean; timelineElapsed: number; referenceOffsetMs: number; referenceMode: string };

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
async function decodeReferenceBuffer(context: AudioContext, url: string) { const response = await fetch(withFullMedia(url), { cache: 'force-cache' }); if (!response.ok) throw new Error(`reference_decode_failed:${response.status}`); const buffer = await response.arrayBuffer(); return context.decodeAudioData(buffer.slice(0)); }
function prepareGraphMedia(media: HTMLMediaElement) { media.preload = 'auto'; media.volume = 1; media.muted = false; if ('playsInline' in media) (media as HTMLVideoElement).playsInline = true; }
function clampOffset(value: number) { return Math.max(-900, Math.min(900, Number.isFinite(value) ? value : 0)); }

// Gap between AudioContext.currentTime (sampled AFTER the seek) and the
// scheduled source start. Must be large enough for the browser to honour the
// schedule AND for visual.play() to begin in time so that the clockGuard sees
// a non-zero currentTime on the first tick.
// 90 ms: comfortably schedulable; imperceptible to human hearing.
const START_DELAY_SECONDS = 0.09;

export class DuetPreviewEngine {
  readonly audio: DuetAudioEngine;
  private refs: DuetPreviewEngineRefs;
  private options: DuetPreviewEngineOptions;
  private visualUrl = '';
  private voiceUrl = '';
  private prepared = false;
  private playing = false;
  private referenceMode: 'timeline-buffer' | 'media-element' = 'timeline-buffer';
  private referenceOffsetMs = 0;
  private voiceBuffer: AudioBuffer | null = null;
  private referenceBuffer: AudioBuffer | null = null;
  private fallbackVoice: HTMLAudioElement | null = null;
  private fallbackReference: HTMLAudioElement | null = null;
  private timelineDuration = 0;
  private timelineStartAt = 0;
  private driftFrame: number | null = null;
  private delayedStartTimer: number | null = null;

  constructor(refs: DuetPreviewEngineRefs, options: DuetPreviewEngineOptions) {
    this.refs = refs;
    this.options = options;
    this.referenceOffsetMs = clampOffset(options.referenceOffsetMs || 0);
    this.audio = new DuetAudioEngine({ latencyHint: 'interactive', sampleRate: 48000 });
    if (options.initialFaders) this.audio.setFaders(options.initialFaders);
    if (options.preGains) this.audio.setPreGains(options.preGains);
  }

  async prepare() {
    if (this.prepared) return;
    this.visualUrl = URL.createObjectURL(this.options.visualBlob);
    this.voiceUrl = URL.createObjectURL(this.options.voiceBlob);
    const { visual, voice, reference } = this.refs;
    visual.src = this.visualUrl; visual.preload = 'auto'; visual.playsInline = true; visual.muted = true; visual.volume = 0;
    voice.src = this.voiceUrl; reference.src = this.options.referenceUrl;
    await Promise.all([waitForMediaReady(visual), waitForMediaReady(voice).catch(() => undefined), waitForMediaReady(reference).catch(() => undefined)]);
    try {
      this.voiceBuffer = await decodeBlob(this.audio.context, this.options.voiceBlob);
      this.audio.connectVoiceBuffer(this.voiceBuffer);
      this.referenceBuffer = await decodeReferenceBuffer(this.audio.context, this.options.referenceUrl);
      this.audio.connectReferenceBuffer(this.referenceBuffer);
      this.referenceMode = 'timeline-buffer';
      try { voice.pause(); voice.removeAttribute('src'); voice.load(); } catch {}
      try { reference.pause(); reference.removeAttribute('src'); reference.load(); } catch {}
    } catch {
      this.fallbackVoice = document.createElement('audio');
      this.fallbackReference = document.createElement('audio');
      prepareGraphMedia(this.fallbackVoice);
      prepareGraphMedia(this.fallbackReference);
      this.fallbackVoice.src = this.voiceUrl;
      this.fallbackReference.src = this.options.referenceUrl;
      await Promise.all([waitForMediaReady(this.fallbackVoice), waitForMediaReady(this.fallbackReference)]);
      this.audio.connectVoiceElement(this.fallbackVoice);
      this.audio.connectReferenceElement(this.fallbackReference);
      this.referenceMode = 'media-element';
    }
    this.timelineDuration = Math.max(this.refs.visual.duration || 0, this.voiceBuffer?.duration || 0, this.referenceBuffer?.duration || 0);
    this.prepared = true;
  }

  async play() {
    await this.prepare();
    this.pause();
    await this.audio.resume();

    if (this.referenceMode === 'media-element') return this.playMediaElementFallback();

    const { visual } = this.refs;
    const faders = this.audio.getFaders();
    const offsetSeconds = this.referenceOffsetMs / 1000;

    // ── Step 1: seek the visual FIRST, wait for completion.
    //    CRITICAL: startAt must be sampled AFTER the seek. If we sample before,
    //    the seek latency eats into START_DELAY_SECONDS and the video always
    //    starts late relative to the audio on 2nd+ plays.
    visual.muted = true;
    visual.volume = 0;
    try { visual.pause(); visual.currentTime = 0; } catch {}
    await waitForSeek(visual);

    // ── Step 2: sample the clock now that the seek is done. Every play()
    //    call — first or 50th — uses a fresh absolute timestamp from the
    //    same AudioContext clock. No accumulated drift is possible.
    const startAt = this.audio.context.currentTime + START_DELAY_SECONDS;

    this.audio.stopVoiceBuffer();
    this.audio.stopReferenceBuffer();
    this.playing = true;
    this.timelineStartAt = startAt;

    // Schedule both buffers at the same absolute time (plus the reference offset).
    if (faders.voice > 0) this.audio.startVoiceBufferAt(startAt, 0);

    if (faders.reference > 0) {
      if (offsetSeconds >= 0) {
        this.audio.startReferenceBufferAt(startAt + offsetSeconds, 0);
      } else {
        this.audio.startReferenceBufferAt(startAt, -offsetSeconds);
      }
    }

    // ── Step 3: start the visual via setTimeout so that visual.play() fires
    //    at the same real-time moment as the audio buffers. The timeout value
    //    matches START_DELAY_SECONDS exactly — no drift because startAt was
    //    already pinned to the post-seek clock reading above.
    this.delayedStartTimer = window.setTimeout(() => {
      if (!this.playing) return;
      visual.play().catch(() => undefined);
      this.startVisualClockGuard();
    }, Math.round(START_DELAY_SECONDS * 1000));
  }

  pause() {
    this.playing = false;
    this.clearDelayedStart();
    this.stopVisualClockGuard();
    try { this.refs.visual.pause(); } catch {}
    this.audio.stopVoiceBuffer();
    this.audio.stopReferenceBuffer();
    if (this.fallbackVoice) try { this.fallbackVoice.pause(); } catch {}
    if (this.fallbackReference) try { this.fallbackReference.pause(); } catch {}
  }

  setReferenceOffsetMs(value: number) { this.referenceOffsetMs = clampOffset(value); }

  setFaders(values: Partial<DuetFaderValues>) {
    this.audio.setFaders(values);
    if (!this.playing || this.referenceMode !== 'media-element') return;
    const faders = this.audio.getFaders();
    if (this.fallbackVoice) this.syncTrackPlaybackState(this.fallbackVoice, faders.voice);
    if (this.fallbackReference) this.syncTrackPlaybackState(this.fallbackReference, faders.reference);
  }

  autoMix() { this.setFaders({ voice: 110, reference: 70 }); }
  getFaders() { return this.audio.getFaders(); }

  getDiagnostic(): DuetPreviewDiagnostic {
    const snapshot = this.audio.getSnapshot();
    const visualTime = this.refs.visual.currentTime || 0;
    const now = this.audio.context.currentTime;
    const timelineElapsed = this.playing ? Math.max(0, now - this.timelineStartAt) : 0;
    return {
      ...snapshot,
      visualTime,
      voiceTime: this.fallbackVoice?.currentTime || 0,
      referenceTime: this.fallbackReference?.currentTime || 0,
      visualPaused: this.refs.visual.paused,
      voicePaused: this.fallbackVoice?.paused ?? true,
      referencePaused: this.fallbackReference?.paused ?? true,
      timelineElapsed,
      referenceOffsetMs: this.referenceOffsetMs,
      referenceMode: this.referenceMode,
    };
  }

  async close() {
    this.pause();
    await this.audio.close();
    if (this.visualUrl) URL.revokeObjectURL(this.visualUrl);
    if (this.voiceUrl) URL.revokeObjectURL(this.voiceUrl);
    this.visualUrl = '';
    this.voiceUrl = '';
    this.prepared = false;
  }

  private async playMediaElementFallback() {
    const visual = this.refs.visual;
    const voice = this.fallbackVoice || this.refs.voice;
    const reference = this.fallbackReference || this.refs.reference;
    const faders = this.audio.getFaders();
    try { visual.currentTime = 0; voice.currentTime = 0; reference.currentTime = 0; } catch {}
    await Promise.all([waitForSeek(visual), waitForSeek(voice), waitForSeek(reference)]);
    this.playing = true;
    this.syncTrackPlaybackState(voice, faders.voice);
    this.syncTrackPlaybackState(reference, faders.reference);
    await Promise.all([
      visual.play().catch(() => undefined),
      faders.voice > 0 ? voice.play().catch(() => undefined) : Promise.resolve(),
      faders.reference > 0 ? reference.play().catch(() => undefined) : Promise.resolve(),
    ]);
  }

  private startVisualClockGuard() {
    this.stopVisualClockGuard();
    const tick = () => {
      if (!this.playing) return;
      const elapsed = Math.max(0, this.audio.context.currentTime - this.timelineStartAt);
      const visualActual = this.refs.visual.currentTime || 0;
      const drift = Math.abs(visualActual - elapsed);
      if (drift > 0.08 && !this.refs.visual.paused) {
        try { this.refs.visual.currentTime = elapsed; } catch {}
      }
      this.driftFrame = requestAnimationFrame(tick);
    };
    this.driftFrame = requestAnimationFrame(tick);
  }

  private stopVisualClockGuard() { if (this.driftFrame) cancelAnimationFrame(this.driftFrame); this.driftFrame = null; }

  private syncTrackPlaybackState(media: HTMLMediaElement, faderValue: number) {
    media.volume = 1; media.muted = false;
    if (faderValue <= 0) { try { media.pause(); } catch {}; return; }
    if (media.paused) { media.play().catch(() => undefined); }
  }

  private clearDelayedStart() { if (this.delayedStartTimer) window.clearTimeout(this.delayedStartTimer); this.delayedStartTimer = null; }
}
