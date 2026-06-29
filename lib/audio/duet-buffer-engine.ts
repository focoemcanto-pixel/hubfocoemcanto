import { reduceVoiceNoise } from './duet-noise-reduction';

export type VoicePreset = 'natural' | 'studio' | 'worship' | 'coral';

type DuetSettings = { voiceVolume: number; referenceVolume: number; preset: VoicePreset; latencyMs?: number; noiseReduction?: boolean };
type Bus = { ctx: AudioContext; voiceInput: GainNode; voiceGain: GainNode; referenceInput: GainNode; referenceGain: GainNode; highpass: BiquadFilterNode; body: BiquadFilterNode; presence: BiquadFilterNode; air: BiquadFilterNode; compressor: DynamicsCompressorNode; delay: DelayNode; wet: GainNode; dry: GainNode; limiter: DynamicsCompressorNode };
type Playback = { voice?: AudioBufferSourceNode; reference?: AudioBufferSourceNode; startedAt: number };

export class DuetBufferEngine {
  private bus: Bus | null = null;
  private playback: Playback | null = null;
  private syncFrame: number | null = null;
  private offset = 0;
  private voicePreGain = 1;
  private referencePreGain = 1;
  private mediaReference: HTMLVideoElement | null = null;
  voiceBuffer: AudioBuffer | null = null;
  cleanVoiceBuffer: AudioBuffer | null = null;
  referenceBuffer: AudioBuffer | null = null;
  video: HTMLVideoElement | null = null;
  isPlaying = false;

  constructor(private getSettings: () => DuetSettings) {}

  async load(voiceBlob: Blob, referenceUrl: string) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('audio_context_missing');
    const ctx = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
    const voiceBuffer = await this.decodeBlob(ctx, voiceBlob);
    try {
      const referenceBuffer = await this.decodeUrl(ctx, referenceUrl);
      if (this.isSilent(referenceBuffer)) throw new Error('silent_reference_url');
      await this.finishLoad(ctx, voiceBuffer, referenceBuffer);
    } catch {
      await this.finishLoadWithMediaReference(ctx, voiceBuffer, referenceUrl);
    }
  }

  async loadBlobs(voiceBlob: Blob, referenceBlob: Blob, referenceUrl?: string) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('audio_context_missing');
    const ctx = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
    const voiceBuffer = await this.decodeBlob(ctx, voiceBlob);
    const referenceBuffer = await this.decodeBlob(ctx, referenceBlob);
    if (this.isSilent(referenceBuffer)) {
      if (referenceUrl) {
        try {
          const urlBuffer = await this.decodeUrl(ctx, referenceUrl);
          if (!this.isSilent(urlBuffer)) return await this.finishLoad(ctx, voiceBuffer, urlBuffer);
        } catch {}
        return await this.finishLoadWithMediaReference(ctx, voiceBuffer, referenceUrl);
      }
      throw new Error('silent_reference_blob');
    }
    await this.finishLoad(ctx, voiceBuffer, referenceBuffer);
  }

  private async finishLoad(ctx: AudioContext, voiceBuffer: AudioBuffer, referenceBuffer: AudioBuffer) {
    this.mediaReference?.pause();
    this.mediaReference = null;
    this.voiceBuffer = voiceBuffer;
    this.cleanVoiceBuffer = reduceVoiceNoise(ctx, voiceBuffer);
    this.referenceBuffer = referenceBuffer;
    this.voicePreGain = this.trackPreGain(voiceBuffer, 0.045, 0.04, 1.6);
    this.referencePreGain = this.trackPreGain(referenceBuffer, 0.06, 0.25, 1.8);
    await this.bus?.ctx.close().catch(() => undefined);
    this.bus = this.makeBus(ctx, ctx.destination);
    this.applySettings();
  }

  private async finishLoadWithMediaReference(ctx: AudioContext, voiceBuffer: AudioBuffer, referenceUrl: string) {
    this.voiceBuffer = voiceBuffer;
    this.cleanVoiceBuffer = reduceVoiceNoise(ctx, voiceBuffer);
    this.referenceBuffer = null;
    this.voicePreGain = this.trackPreGain(voiceBuffer, 0.045, 0.04, 1.6);
    this.referencePreGain = 1;
    const ref = document.createElement('video');
    ref.src = referenceUrl;
    ref.crossOrigin = 'anonymous';
    ref.playsInline = true;
    ref.preload = 'auto';
    ref.muted = false;
    ref.volume = this.getSettings().referenceVolume / 100;
    this.mediaReference = ref;
    await this.bus?.ctx.close().catch(() => undefined);
    this.bus = this.makeBus(ctx, ctx.destination);
    this.applySettings();
  }

  setVideo(video: HTMLVideoElement | null) { this.video = video; }

  applySettings() {
    const bus = this.bus;
    if (!bus) return;
    const { voiceVolume, referenceVolume, preset } = this.getSettings();
    const now = bus.ctx.currentTime;
    bus.voiceGain.gain.cancelScheduledValues(now);
    bus.referenceGain.gain.cancelScheduledValues(now);
    bus.voiceGain.gain.setTargetAtTime((voiceVolume / 100) * this.voicePreGain, now, 0.003);
    bus.referenceGain.gain.setTargetAtTime((referenceVolume / 100) * this.referencePreGain, now, 0.003);
    if (this.mediaReference) this.mediaReference.volume = Math.max(0, Math.min(1, referenceVolume / 100));
    this.applyPreset(bus, preset);
  }

  async toggle() {
    if (this.isPlaying) {
      this.pause(true);
      return false;
    }
    await this.play();
    return true;
  }

  async play() {
    const activeVoiceBuffer = this.getSettings().noiseReduction ? this.cleanVoiceBuffer : this.voiceBuffer;
    if (!this.bus || !activeVoiceBuffer || !this.video || (!this.referenceBuffer && !this.mediaReference)) return;
    this.stopSources();
    this.applySettings();
    const duration = this.duration();
    let offset = this.offset;
    if (duration && offset >= duration - 0.05) offset = 0;
    const latencySeconds = this.voiceLatencySeconds();
    const voiceOffset = Math.min(Math.max(0, offset + latencySeconds), Math.max(0, activeVoiceBuffer.duration - 0.02));
    const voice = this.bus.ctx.createBufferSource();
    voice.buffer = activeVoiceBuffer;
    voice.connect(this.bus.voiceInput);
    await this.bus.ctx.resume().catch(() => undefined);
    this.video.muted = true;
    this.video.currentTime = offset;
    this.video.playbackRate = 1;
    await this.video.play().catch(() => undefined);
    const startAt = this.bus.ctx.currentTime + 0.035;
    voice.start(startAt, voiceOffset);
    let reference: AudioBufferSourceNode | undefined;
    if (this.referenceBuffer) {
      reference = this.bus.ctx.createBufferSource();
      reference.buffer = this.referenceBuffer;
      reference.connect(this.bus.referenceInput);
      reference.onended = () => { if (this.isPlaying) this.pause(false, true); };
      reference.start(startAt, offset);
    } else if (this.mediaReference) {
      this.mediaReference.pause();
      this.mediaReference.currentTime = offset;
      this.mediaReference.playbackRate = 1;
      this.mediaReference.volume = Math.max(0, Math.min(1, this.getSettings().referenceVolume / 100));
      await this.mediaReference.play().catch(() => undefined);
      this.mediaReference.onended = () => { if (this.isPlaying) this.pause(false, true); };
    }
    this.playback = { voice, reference, startedAt: startAt - offset };
    this.offset = offset;
    this.isPlaying = true;
    this.startSyncLoop();
  }

  pause(storeOffset = true, reset = false) {
    if (storeOffset) this.offset = this.currentTime();
    if (reset) this.offset = 0;
    this.stopSyncLoop();
    this.stopSources();
    if (this.video) {
      this.video.pause();
      this.video.playbackRate = 1;
      if (reset) this.video.currentTime = 0;
    }
    if (this.mediaReference) {
      this.mediaReference.pause();
      this.mediaReference.playbackRate = 1;
      if (reset) this.mediaReference.currentTime = 0;
    }
    this.isPlaying = false;
  }

  destroy() {
    this.pause(false);
    this.bus?.ctx.close().catch(() => undefined);
    this.bus = null;
    this.voiceBuffer = null;
    this.cleanVoiceBuffer = null;
    this.referenceBuffer = null;
    this.mediaReference = null;
  }

  currentTime() {
    if (!this.playback || !this.bus || !this.isPlaying) return this.offset;
    return Math.max(0, this.bus.ctx.currentTime - this.playback.startedAt);
  }

  duration() {
    const videoDuration = this.video?.duration || 0;
    const activeVoiceBuffer = this.getSettings().noiseReduction ? this.cleanVoiceBuffer : this.voiceBuffer;
    const voiceDuration = Math.max(0, (activeVoiceBuffer?.duration || 0) - this.voiceLatencySeconds());
    const referenceDuration = this.referenceBuffer?.duration || this.mediaReference?.duration || 0;
    return Math.max(0, Math.min(...[videoDuration, voiceDuration, referenceDuration].filter(Boolean)) || videoDuration || voiceDuration || referenceDuration);
  }

  private voiceLatencySeconds() { const latencyMs = this.getSettings().latencyMs || 0; return Math.max(0, Math.min(0.28, latencyMs / 1000)); }

  private startSyncLoop() {
    this.stopSyncLoop();
    const tick = () => {
      if (!this.video || !this.isPlaying) return;
      const audioTime = this.currentTime();
      const duration = this.duration();
      if (duration && audioTime >= duration - 0.02) {
        this.pause(false, true);
        return;
      }
      const drift = this.video.currentTime - audioTime;
      if (Math.abs(drift) > 0.22) this.video.currentTime = audioTime;
      else this.video.playbackRate = Math.max(0.97, Math.min(1.03, 1 - drift * 0.12));
      if (this.mediaReference) {
        const refDrift = this.mediaReference.currentTime - audioTime;
        if (Math.abs(refDrift) > 0.25) this.mediaReference.currentTime = audioTime;
        else this.mediaReference.playbackRate = Math.max(0.97, Math.min(1.03, 1 - refDrift * 0.12));
      }
      this.syncFrame = requestAnimationFrame(tick);
    };
    this.syncFrame = requestAnimationFrame(tick);
  }

  private stopSyncLoop() { if (this.syncFrame) cancelAnimationFrame(this.syncFrame); this.syncFrame = null; }
  private stopSources() { try { this.playback?.voice?.stop(); } catch {} try { this.playback?.reference?.stop(); } catch {} this.playback = null; }
  private async decodeBlob(ctx: AudioContext, blob: Blob) { const arrayBuffer = await blob.arrayBuffer(); return await ctx.decodeAudioData(arrayBuffer.slice(0)); }
  private async decodeUrl(ctx: AudioContext, url: string) { const response = await fetch(url, { cache: 'force-cache' }); if (!response.ok) throw new Error('reference_fetch_failed'); const arrayBuffer = await response.arrayBuffer(); return await ctx.decodeAudioData(arrayBuffer.slice(0)); }

  private activeRms(buffer: AudioBuffer) {
    const samples = this.bufferSamples(buffer);
    if (!samples.length) return 0;
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    const gate = Math.max(0.0015, rms * 0.35);
    let activeSum = 0;
    let activeCount = 0;
    for (const sample of samples) {
      if (Math.abs(sample) >= gate) {
        activeSum += sample * sample;
        activeCount += 1;
      }
    }
    return Math.sqrt(activeSum / Math.max(1, activeCount)) || rms;
  }

  private isSilent(buffer: AudioBuffer) {
    return this.activeRms(buffer) < 0.0012;
  }

  private bufferSamples(buffer: AudioBuffer) {
    const samples: number[] = [];
    const channels = Math.max(1, buffer.numberOfChannels);
    const step = Math.max(1, Math.floor(buffer.length / 80000));
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += step) samples.push(data[i]);
    }
    return samples;
  }

  private trackPreGain(buffer: AudioBuffer, targetRms: number, min: number, max: number) {
    const rms = this.activeRms(buffer);
    if (!Number.isFinite(rms) || rms <= 0.0001) return 1;
    return Math.max(min, Math.min(max, targetRms / rms));
  }

  private makeBus(ctx: AudioContext, destination: AudioNode): Bus {
    const voiceInput = ctx.createGain(); const voiceGain = ctx.createGain(); const referenceInput = ctx.createGain(); const referenceGain = ctx.createGain(); const highpass = ctx.createBiquadFilter(); const body = ctx.createBiquadFilter(); const presence = ctx.createBiquadFilter(); const air = ctx.createBiquadFilter(); const compressor = ctx.createDynamicsCompressor(); const delay = ctx.createDelay(0.45); const wet = ctx.createGain(); const dry = ctx.createGain(); const limiter = ctx.createDynamicsCompressor();
    highpass.type = 'highpass'; body.type = 'peaking'; presence.type = 'peaking'; air.type = 'highshelf'; limiter.threshold.value = -5.5; limiter.knee.value = 1.5; limiter.ratio.value = 14; limiter.attack.value = 0.002; limiter.release.value = 0.08;
    voiceInput.connect(voiceGain).connect(highpass).connect(body).connect(presence).connect(air).connect(compressor); compressor.connect(dry).connect(limiter); compressor.connect(delay).connect(wet).connect(limiter); limiter.connect(destination); referenceInput.connect(referenceGain).connect(destination);
    return { ctx, voiceInput, voiceGain, referenceInput, referenceGain, highpass, body, presence, air, compressor, delay, wet, dry, limiter };
  }

  private applyPreset(nodes: Bus, selected: VoicePreset) {
    const now = nodes.ctx.currentTime;
    const set = (param: AudioParam, value: number, speed = 0.006) => { param.cancelScheduledValues(now); param.setTargetAtTime(value, now, speed); };
    const presets: Record<VoicePreset, { highpass: number; bodyGain: number; presenceGain: number; airGain: number; threshold: number; ratio: number; delay: number; wet: number; dry: number; }> = { natural: { highpass: 65, bodyGain: 0.2, presenceGain: 0.8, airGain: 0.4, threshold: -18, ratio: 1.8, delay: 0.001, wet: 0, dry: 1 }, studio: { highpass: 92, bodyGain: 2.4, presenceGain: 6.2, airGain: 4.5, threshold: -32, ratio: 5.8, delay: 0.018, wet: 0.05, dry: 0.95 }, worship: { highpass: 105, bodyGain: 1.4, presenceGain: 4.8, airGain: 5.6, threshold: -30, ratio: 4.6, delay: 0.16, wet: 0.28, dry: 0.9 }, coral: { highpass: 115, bodyGain: 0.6, presenceGain: 3.2, airGain: 2.2, threshold: -28, ratio: 4, delay: 0.035, wet: 0.36, dry: 0.82 } };
    const current = presets[selected];
    set(nodes.highpass.frequency, current.highpass); set(nodes.body.frequency, 240); set(nodes.body.Q, 0.7); set(nodes.body.gain, current.bodyGain); set(nodes.presence.frequency, 3300); set(nodes.presence.Q, 0.85); set(nodes.presence.gain, current.presenceGain); set(nodes.air.frequency, 7200); set(nodes.air.gain, current.airGain); set(nodes.compressor.threshold, current.threshold); set(nodes.compressor.knee, 14); set(nodes.compressor.ratio, current.ratio); set(nodes.compressor.attack, 0.003); set(nodes.compressor.release, 0.14); set(nodes.delay.delayTime, current.delay); set(nodes.wet.gain, current.wet); set(nodes.dry.gain, current.dry);
  }
}
