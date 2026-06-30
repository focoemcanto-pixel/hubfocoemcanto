import { DuetAudioEngine, type DuetAudioEngineSnapshot, type DuetFaderValues } from './duet-audio-engine';

export type DuetPreviewEngineRefs = {
  visual: HTMLVideoElement;
  voice: HTMLAudioElement;
  reference: HTMLAudioElement | HTMLVideoElement;
};

export type DuetPreviewEngineOptions = {
  visualBlob: Blob;
  voiceBlob: Blob;
  referenceUrl: string;
  initialFaders?: Partial<DuetFaderValues>;
  preGains?: Partial<{ voice: number; reference: number }>;
  referenceOffsetMs?: number;
};

export type DuetPreviewDiagnostic = DuetAudioEngineSnapshot & {
  visualTime: number;
  voiceTime: number;
  referenceTime: number;
  visualPaused: boolean;
  voicePaused: boolean;
  referencePaused: boolean;
  voiceDriftMs: number;
  referenceDriftMs: number;
  referenceOffsetMs: number;
};

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
    const fail = () => cleanup(() => reject(new Error('preview_media_load_failed')));
    const timer = window.setTimeout(() => cleanup(() => reject(new Error('preview_media_timeout'))), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('loadeddata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
}

function prepareSilentMedia(media: HTMLMediaElement) {
  media.preload = 'auto';
  media.volume = 0;
  media.muted = false;
  if ('playsInline' in media) (media as HTMLVideoElement).playsInline = true;
}

function clampOffset(value: number) {
  return Math.max(-300, Math.min(300, Number.isFinite(value) ? value : 0));
}

export class DuetPreviewEngine {
  readonly audio: DuetAudioEngine;

  private refs: DuetPreviewEngineRefs;
  private options: DuetPreviewEngineOptions;
  private visualUrl = '';
  private voiceUrl = '';
  private prepared = false;
  private playing = false;
  private referenceOffsetMs = 0;
  private referenceDelayTimer: number | null = null;

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
    visual.src = this.visualUrl;
    visual.preload = 'auto';
    visual.playsInline = true;
    visual.muted = true;
    visual.volume = 0;

    prepareSilentMedia(voice);
    prepareSilentMedia(reference);
    voice.src = this.voiceUrl;
    reference.src = this.options.referenceUrl;

    await Promise.all([waitForMediaReady(visual), waitForMediaReady(voice), waitForMediaReady(reference)]);

    this.audio.connectVoiceElement(voice);
    this.audio.connectReferenceElement(reference);
    this.prepared = true;
  }

  async play() {
    await this.prepare();
    this.clearReferenceDelay();
    const { visual, voice, reference } = this.refs;
    const offsetSeconds = this.referenceOffsetMs / 1000;
    visual.currentTime = 0;
    voice.currentTime = 0;
    reference.currentTime = offsetSeconds < 0 ? Math.abs(offsetSeconds) : 0;
    visual.muted = true;
    visual.volume = 0;
    voice.volume = 0;
    reference.volume = 0;
    this.playing = true;
    await this.audio.resume();
    const faders = this.audio.getFaders();
    const jobs: Promise<unknown>[] = [visual.play()];
    if (faders.voice > 0) jobs.push(voice.play().catch(() => undefined));
    if (faders.reference > 0) {
      if (offsetSeconds > 0) {
        this.referenceDelayTimer = window.setTimeout(() => {
          if (this.playing && !this.refs.visual.paused) this.refs.reference.play().catch(() => undefined);
        }, this.referenceOffsetMs);
      } else {
        jobs.push(reference.play().catch(() => undefined));
      }
    }
    await Promise.all(jobs);
  }

  pause() {
    this.playing = false;
    this.clearReferenceDelay();
    try { this.refs.visual.pause(); } catch {}
    try { this.refs.voice.pause(); } catch {}
    try { this.refs.reference.pause(); } catch {}
  }

  setReferenceOffsetMs(value: number) {
    this.referenceOffsetMs = clampOffset(value);
  }

  setFaders(values: Partial<DuetFaderValues>) {
    this.audio.setFaders(values);
    const faders = this.audio.getFaders();
    if (!this.playing) return;
    this.syncMutedTrackState(this.refs.voice, faders.voice);
    this.syncMutedTrackState(this.refs.reference, faders.reference);
  }

  autoMix() {
    this.setFaders({ voice: 110, reference: 70 });
  }

  getFaders() {
    return this.audio.getFaders();
  }

  getDiagnostic(): DuetPreviewDiagnostic {
    const snapshot = this.audio.getSnapshot();
    const visualTime = this.refs.visual.currentTime || 0;
    const voiceTime = this.refs.voice.currentTime || 0;
    const referenceTime = this.refs.reference.currentTime || 0;
    return {
      ...snapshot,
      visualTime,
      voiceTime,
      referenceTime,
      visualPaused: this.refs.visual.paused,
      voicePaused: this.refs.voice.paused,
      referencePaused: this.refs.reference.paused,
      voiceDriftMs: Math.round((voiceTime - visualTime) * 1000),
      referenceDriftMs: Math.round((referenceTime - visualTime) * 1000),
      referenceOffsetMs: this.referenceOffsetMs,
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

  private syncMutedTrackState(media: HTMLMediaElement, faderValue: number) {
    media.volume = 0;
    media.muted = false;
    if (faderValue <= 0) {
      try { media.pause(); } catch {}
      return;
    }
    if (media.paused && !this.refs.visual.paused) {
      try { media.currentTime = this.refs.visual.currentTime || 0; } catch {}
      media.play().catch(() => undefined);
    }
  }

  private clearReferenceDelay() {
    if (this.referenceDelayTimer) window.clearTimeout(this.referenceDelayTimer);
    this.referenceDelayTimer = null;
  }
}
