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
  referenceMode: 'buffer' | 'media-element';
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

function waitForSeek(media: HTMLMediaElement, timeoutMs = 1200) {
  return new Promise<void>((resolve) => {
    if (!media.seeking) return resolve();
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      media.removeEventListener('seeked', cleanup);
      resolve();
    };
    const timer = window.setTimeout(cleanup, timeoutMs);
    media.addEventListener('seeked', cleanup, { once: true });
  });
}

function withFullMedia(url: string) {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}full=1`;
}

async function decodeReferenceBuffer(context: AudioContext, url: string) {
  const response = await fetch(withFullMedia(url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`reference_decode_fetch_failed:${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return context.decodeAudioData(arrayBuffer.slice(0));
}

function prepareGraphMedia(media: HTMLMediaElement) {
  media.preload = 'auto';
  media.volume = 1;
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
  private delayedStartTimer: number | null = null;
  private driftFrame: number | null = null;
  private referenceStartedAt = 0;
  private referenceMode: 'buffer' | 'media-element' = 'buffer';

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

    prepareGraphMedia(voice);
    prepareGraphMedia(reference);
    voice.src = this.voiceUrl;
    reference.src = this.options.referenceUrl;

    await Promise.all([waitForMediaReady(visual), waitForMediaReady(voice), waitForMediaReady(reference)]);

    this.audio.connectVoiceElement(voice);
    try {
      const referenceBuffer = await decodeReferenceBuffer(this.audio.context, this.options.referenceUrl);
      this.audio.connectReferenceBuffer(referenceBuffer);
      reference.pause();
      reference.removeAttribute('src');
      reference.load();
      this.referenceMode = 'buffer';
    } catch {
      reference.src = this.options.referenceUrl;
      await waitForMediaReady(reference);
      prepareGraphMedia(reference);
      this.audio.connectReferenceElement(reference);
      this.referenceMode = 'media-element';
    }
    this.prepared = true;
  }

  async play() {
    await this.prepare();
    this.pause();
    await this.audio.resume();

    const { visual, voice, reference } = this.refs;
    const faders = this.audio.getFaders();
    const offsetSeconds = this.referenceOffsetMs / 1000;

    try { visual.currentTime = 0; } catch {}
    try { voice.currentTime = 0; } catch {}
    try { reference.currentTime = 0; } catch {}
    await Promise.all([waitForSeek(visual), waitForSeek(voice), waitForSeek(reference)]);

    visual.muted = true;
    visual.volume = 0;
    voice.volume = 1;
    voice.muted = false;
    reference.volume = 1;
    reference.muted = false;
    this.playing = true;
    this.audio.stopReferenceBuffer();

    if (this.referenceMode === 'buffer') {
      if (offsetSeconds < 0 && faders.reference > 0) {
        this.referenceStartedAt = this.audio.context.currentTime;
        this.audio.startReferenceBuffer(0, 0);
        this.delayedStartTimer = window.setTimeout(() => {
          if (!this.playing) return;
          void this.startVisualAndVoice();
        }, Math.abs(this.referenceOffsetMs));
        this.startDriftGuard();
        return;
      }

      await this.startVisualAndVoice();
      if (faders.reference > 0) {
        const delay = Math.max(0, offsetSeconds);
        this.referenceStartedAt = this.audio.context.currentTime + delay;
        this.audio.startReferenceBuffer(delay, 0);
      }
      this.startDriftGuard();
      return;
    }

    if (offsetSeconds < 0 && faders.reference > 0) {
      this.referenceStartedAt = this.audio.context.currentTime;
      await reference.play().catch(() => undefined);
      this.delayedStartTimer = window.setTimeout(() => {
        if (!this.playing) return;
        void this.startVisualAndVoice();
      }, Math.abs(this.referenceOffsetMs));
      this.startDriftGuard();
      return;
    }

    await this.startVisualAndVoice();
    if (faders.reference > 0) {
      if (offsetSeconds > 0) {
        this.referenceStartedAt = this.audio.context.currentTime + offsetSeconds;
        this.delayedStartTimer = window.setTimeout(() => {
          if (!this.playing) return;
          try { this.refs.reference.currentTime = this.refs.visual.currentTime || 0; } catch {}
          this.refs.reference.play().catch(() => undefined);
        }, this.referenceOffsetMs);
      } else {
        try { reference.currentTime = visual.currentTime || 0; } catch {}
        this.referenceStartedAt = this.audio.context.currentTime;
        await reference.play().catch(() => undefined);
      }
    }
    this.startDriftGuard();
  }

  pause() {
    this.playing = false;
    this.clearDelayedStart();
    this.stopDriftGuard();
    this.audio.stopReferenceBuffer();
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
    this.syncTrackPlaybackState(this.refs.voice, faders.voice);
    if (this.referenceMode === 'media-element') this.syncTrackPlaybackState(this.refs.reference, faders.reference);
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
    const now = this.audio.context.currentTime;
    const referenceTime = this.referenceMode === 'media-element'
      ? this.refs.reference.currentTime || 0
      : this.playing && now >= this.referenceStartedAt ? Math.max(0, now - this.referenceStartedAt) : 0;
    return {
      ...snapshot,
      visualTime,
      voiceTime,
      referenceTime,
      visualPaused: this.refs.visual.paused,
      voicePaused: this.refs.voice.paused,
      referencePaused: this.referenceMode === 'media-element' ? this.refs.reference.paused : !this.playing || now < this.referenceStartedAt,
      voiceDriftMs: Math.round((voiceTime - visualTime) * 1000),
      referenceDriftMs: Math.round((referenceTime - visualTime) * 1000),
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

  private async startVisualAndVoice() {
    const faders = this.audio.getFaders();
    const jobs: Promise<unknown>[] = [this.refs.visual.play().catch(() => undefined)];
    if (faders.voice > 0) jobs.push(this.refs.voice.play().catch(() => undefined));
    await Promise.all(jobs);
    this.alignVoiceToVisual();
  }

  private alignVoiceToVisual() {
    if (!this.playing) return;
    const visualTime = this.refs.visual.currentTime || 0;
    if (this.audio.getFaders().voice > 0) {
      const voiceDrift = Math.abs((this.refs.voice.currentTime || 0) - visualTime);
      if (voiceDrift > 0.035) {
        try { this.refs.voice.currentTime = visualTime; } catch {}
      }
    }
    if (this.referenceMode === 'media-element' && this.audio.getFaders().reference > 0) {
      const target = Math.max(0, visualTime - this.referenceOffsetMs / 1000);
      const referenceDrift = Math.abs((this.refs.reference.currentTime || 0) - target);
      if (referenceDrift > 0.045) {
        try { this.refs.reference.currentTime = target; } catch {}
      }
    }
  }

  private startDriftGuard() {
    this.stopDriftGuard();
    const tick = () => {
      if (!this.playing) return;
      this.alignVoiceToVisual();
      this.driftFrame = requestAnimationFrame(tick);
    };
    this.driftFrame = requestAnimationFrame(tick);
  }

  private stopDriftGuard() {
    if (this.driftFrame) cancelAnimationFrame(this.driftFrame);
    this.driftFrame = null;
  }

  private syncTrackPlaybackState(media: HTMLMediaElement, faderValue: number) {
    media.volume = 1;
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

  private clearDelayedStart() {
    if (this.delayedStartTimer) window.clearTimeout(this.delayedStartTimer);
    this.delayedStartTimer = null;
  }
}
