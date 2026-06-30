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
};

export type DuetPreviewDiagnostic = DuetAudioEngineSnapshot & {
  visualTime: number;
  voiceTime: number;
  referenceTime: number;
  visualPaused: boolean;
  voicePaused: boolean;
  referencePaused: boolean;
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

export class DuetPreviewEngine {
  readonly audio: DuetAudioEngine;

  private refs: DuetPreviewEngineRefs;
  private options: DuetPreviewEngineOptions;
  private visualUrl = '';
  private voiceUrl = '';
  private prepared = false;
  private playing = false;
  private syncTimer: number | null = null;

  constructor(refs: DuetPreviewEngineRefs, options: DuetPreviewEngineOptions) {
    this.refs = refs;
    this.options = options;
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
    const { visual, voice, reference } = this.refs;
    visual.currentTime = 0;
    voice.currentTime = 0;
    reference.currentTime = 0;
    visual.muted = true;
    visual.volume = 0;
    voice.volume = 0;
    reference.volume = 0;
    this.playing = true;
    await this.audio.resume();
    await visual.play();
    const faders = this.audio.getFaders();
    if (faders.voice > 0) await voice.play().catch(() => undefined);
    if (faders.reference > 0) await reference.play().catch(() => undefined);
    this.startSyncGuard();
  }

  pause() {
    this.playing = false;
    this.stopSyncGuard();
    try { this.refs.visual.pause(); } catch {}
    try { this.refs.voice.pause(); } catch {}
    try { this.refs.reference.pause(); } catch {}
  }

  setFaders(values: Partial<DuetFaderValues>) {
    this.audio.setFaders(values);
    const faders = this.audio.getFaders();
    const visualTime = Number.isFinite(this.refs.visual.currentTime) ? this.refs.visual.currentTime : 0;
    if (this.playing) {
      if (typeof values.voice === 'number') this.syncTrackPlayback(this.refs.voice, faders.voice, visualTime);
      if (typeof values.reference === 'number') this.syncTrackPlayback(this.refs.reference, faders.reference, visualTime);
    }
  }

  autoMix() {
    this.setFaders({ voice: 110, reference: 70 });
  }

  getFaders() {
    return this.audio.getFaders();
  }

  getDiagnostic(): DuetPreviewDiagnostic {
    const snapshot = this.audio.getSnapshot();
    return {
      ...snapshot,
      visualTime: this.refs.visual.currentTime || 0,
      voiceTime: this.refs.voice.currentTime || 0,
      referenceTime: this.refs.reference.currentTime || 0,
      visualPaused: this.refs.visual.paused,
      voicePaused: this.refs.voice.paused,
      referencePaused: this.refs.reference.paused,
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

  private syncTrackPlayback(media: HTMLMediaElement, faderValue: number, targetTime: number) {
    media.volume = 0;
    media.muted = false;
    if (faderValue <= 0) {
      try { media.pause(); } catch {}
      return;
    }
    if (Math.abs((media.currentTime || 0) - targetTime) > 0.18) {
      try { media.currentTime = targetTime; } catch {}
    }
    media.play().catch(() => undefined);
  }

  private startSyncGuard() {
    this.stopSyncGuard();
    this.syncTimer = window.setInterval(() => {
      if (!this.playing) return;
      const faders = this.audio.getFaders();
      const time = this.refs.visual.currentTime || 0;
      this.refs.voice.volume = 0;
      this.refs.reference.volume = 0;
      if (faders.voice > 0 && !this.refs.visual.paused) this.syncTrackPlayback(this.refs.voice, faders.voice, time);
      if (faders.reference > 0 && !this.refs.visual.paused) this.syncTrackPlayback(this.refs.reference, faders.reference, time);
      if (this.refs.visual.ended) this.pause();
    }, 500);
  }

  private stopSyncGuard() {
    if (this.syncTimer) window.clearInterval(this.syncTimer);
    this.syncTimer = null;
  }
}
