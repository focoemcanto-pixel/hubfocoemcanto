export type DuetTrackKind = 'voice' | 'reference';

export type DuetAudioEngineTrack = {
  kind: DuetTrackKind;
  gain: GainNode;
  analyser: AnalyserNode;
  element?: HTMLMediaElement;
  source?: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | AudioBufferSourceNode;
};

export type DuetAudioEngineOptions = {
  sampleRate?: number;
  latencyHint?: AudioContextLatencyCategory;
};

export type DuetFaderValues = {
  voice: number;
  reference: number;
};

export type DuetAudioEngineSnapshot = {
  contextState: AudioContextState;
  voiceGain: number;
  referenceGain: number;
  masterDb: number;
  voiceDb: number;
  referenceDb: number;
};

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_VOICE_PRE_GAIN = 3.2;
const DEFAULT_REFERENCE_PRE_GAIN = 0.08;

function createAudioContext(options?: DuetAudioEngineOptions) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('audio_context_missing');
  return new AudioCtx({
    latencyHint: options?.latencyHint || 'interactive',
    sampleRate: options?.sampleRate || DEFAULT_SAMPLE_RATE,
  });
}

function toLinearGain(percent: number, preGain: number) {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(6, (percent / 100) * preGain));
}

function configureAnalyser(analyser: AnalyserNode) {
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
}

function configureVoiceCompressor(node: DynamicsCompressorNode) {
  node.threshold.value = -22;
  node.knee.value = 18;
  node.ratio.value = 2.6;
  node.attack.value = 0.008;
  node.release.value = 0.16;
}

function configureLimiter(node: DynamicsCompressorNode) {
  node.threshold.value = -3;
  node.knee.value = 0;
  node.ratio.value = 18;
  node.attack.value = 0.003;
  node.release.value = 0.08;
}

function rmsDb(analyser: AnalyserNode) {
  const data = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (const sample of data) sum += sample * sample;
  const rms = Math.sqrt(sum / data.length);
  return 20 * Math.log10(Math.max(rms, 0.000001));
}

export class DuetAudioEngine {
  readonly context: AudioContext;
  readonly destination: MediaStreamAudioDestinationNode;
  readonly masterLimiter: DynamicsCompressorNode;
  readonly masterAnalyser: AnalyserNode;

  private voiceTrack: DuetAudioEngineTrack | null = null;
  private referenceTrack: DuetAudioEngineTrack | null = null;
  private voiceBuffer: AudioBuffer | null = null;
  private referenceBuffer: AudioBuffer | null = null;
  private activeVoiceBufferSource: AudioBufferSourceNode | null = null;
  private activeReferenceBufferSource: AudioBufferSourceNode | null = null;
  private voicePreGain = DEFAULT_VOICE_PRE_GAIN;
  private referencePreGain = DEFAULT_REFERENCE_PRE_GAIN;
  private faders: DuetFaderValues = { voice: 100, reference: 100 };

  constructor(options?: DuetAudioEngineOptions) {
    this.context = createAudioContext(options);
    this.destination = this.context.createMediaStreamDestination();
    this.masterLimiter = this.context.createDynamicsCompressor();
    this.masterAnalyser = this.context.createAnalyser();
    configureLimiter(this.masterLimiter);
    configureAnalyser(this.masterAnalyser);
    this.masterLimiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.context.destination);
    this.masterLimiter.connect(this.destination);
  }

  async resume() {
    if (this.context.state !== 'running') await this.context.resume();
  }

  setPreGains(values: Partial<{ voice: number; reference: number }>) {
    if (typeof values.voice === 'number') this.voicePreGain = Math.max(0, values.voice);
    if (typeof values.reference === 'number') this.referencePreGain = Math.max(0, values.reference);
    this.applyFaders();
  }

  setFaders(values: Partial<DuetFaderValues>) {
    this.faders = { ...this.faders, ...values };
    this.applyFaders();
  }

  getFaders() {
    return { ...this.faders };
  }

  connectVoiceElement(element: HTMLMediaElement) {
    this.disconnectTrack('voice');
    this.prepareMediaElementForGraph(element);
    const source = this.context.createMediaElementSource(element);
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    const compressor = this.context.createDynamicsCompressor();
    configureAnalyser(analyser);
    configureVoiceCompressor(compressor);
    source.connect(compressor).connect(gain).connect(analyser).connect(this.masterLimiter);
    this.voiceBuffer = null;
    this.voiceTrack = { kind: 'voice', element, source, gain, analyser };
    this.applyFaders();
    return this.voiceTrack;
  }

  connectVoiceBuffer(buffer: AudioBuffer) {
    this.disconnectTrack('voice');
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    const compressor = this.context.createDynamicsCompressor();
    configureAnalyser(analyser);
    configureVoiceCompressor(compressor);
    compressor.connect(gain).connect(analyser).connect(this.masterLimiter);
    this.voiceBuffer = buffer;
    this.voiceTrack = { kind: 'voice', gain, analyser };
    this.applyFaders();
    return this.voiceTrack;
  }

  connectReferenceElement(element: HTMLMediaElement) {
    this.disconnectTrack('reference');
    this.prepareMediaElementForGraph(element);
    const source = this.context.createMediaElementSource(element);
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    configureAnalyser(analyser);
    source.connect(gain).connect(analyser).connect(this.masterLimiter);
    this.referenceTrack = { kind: 'reference', element, source, gain, analyser };
    this.referenceBuffer = null;
    this.applyFaders();
    return this.referenceTrack;
  }

  connectReferenceBuffer(buffer: AudioBuffer) {
    this.disconnectTrack('reference');
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    configureAnalyser(analyser);
    gain.connect(analyser).connect(this.masterLimiter);
    this.referenceBuffer = buffer;
    this.referenceTrack = { kind: 'reference', gain, analyser };
    this.applyFaders();
    return this.referenceTrack;
  }

  startVoiceBuffer(delaySeconds = 0, offsetSeconds = 0) {
    if (!this.voiceBuffer || !this.voiceTrack) return null;
    this.stopVoiceBuffer();
    const source = this.context.createBufferSource();
    source.buffer = this.voiceBuffer;
    source.connect(this.voiceTrack.gain);
    const safeDelay = Math.max(0, delaySeconds || 0);
    const safeOffset = Math.max(0, Math.min(this.voiceBuffer.duration - 0.01, offsetSeconds || 0));
    source.start(this.context.currentTime + safeDelay, safeOffset);
    this.activeVoiceBufferSource = source;
    return source;
  }

  startReferenceBuffer(delaySeconds = 0, offsetSeconds = 0) {
    if (!this.referenceBuffer || !this.referenceTrack) return null;
    this.stopReferenceBuffer();
    const source = this.context.createBufferSource();
    source.buffer = this.referenceBuffer;
    source.connect(this.referenceTrack.gain);
    const safeDelay = Math.max(0, delaySeconds || 0);
    const safeOffset = Math.max(0, Math.min(this.referenceBuffer.duration - 0.01, offsetSeconds || 0));
    source.start(this.context.currentTime + safeDelay, safeOffset);
    this.activeReferenceBufferSource = source;
    return source;
  }

  stopVoiceBuffer() {
    if (!this.activeVoiceBufferSource) return;
    try { this.activeVoiceBufferSource.stop(); } catch {}
    try { this.activeVoiceBufferSource.disconnect(); } catch {}
    this.activeVoiceBufferSource = null;
  }

  stopReferenceBuffer() {
    if (!this.activeReferenceBufferSource) return;
    try { this.activeReferenceBufferSource.stop(); } catch {}
    try { this.activeReferenceBufferSource.disconnect(); } catch {}
    this.activeReferenceBufferSource = null;
  }

  connectVoiceStream(stream: MediaStream) {
    this.disconnectTrack('voice');
    const source = this.context.createMediaStreamSource(stream);
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    const compressor = this.context.createDynamicsCompressor();
    configureAnalyser(analyser);
    configureVoiceCompressor(compressor);
    source.connect(compressor).connect(gain).connect(analyser).connect(this.masterLimiter);
    this.voiceBuffer = null;
    this.voiceTrack = { kind: 'voice', source, gain, analyser };
    this.applyFaders();
    return this.voiceTrack;
  }

  connectReferenceStream(stream: MediaStream) {
    this.disconnectTrack('reference');
    const source = this.context.createMediaStreamSource(stream);
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    configureAnalyser(analyser);
    source.connect(gain).connect(analyser).connect(this.masterLimiter);
    this.referenceTrack = { kind: 'reference', source, gain, analyser };
    this.referenceBuffer = null;
    this.applyFaders();
    return this.referenceTrack;
  }

  getOutputStream() {
    return this.destination.stream;
  }

  getSnapshot(): DuetAudioEngineSnapshot {
    return {
      contextState: this.context.state,
      voiceGain: this.voiceTrack?.gain.gain.value || 0,
      referenceGain: this.referenceTrack?.gain.gain.value || 0,
      masterDb: rmsDb(this.masterAnalyser),
      voiceDb: this.voiceTrack ? rmsDb(this.voiceTrack.analyser) : -120,
      referenceDb: this.referenceTrack ? rmsDb(this.referenceTrack.analyser) : -120,
    };
  }

  async close() {
    this.disconnectTrack('voice');
    this.disconnectTrack('reference');
    this.masterLimiter.disconnect();
    this.masterAnalyser.disconnect();
    await this.context.close().catch(() => undefined);
  }

  private prepareMediaElementForGraph(element: HTMLMediaElement) {
    element.volume = 1;
    element.muted = false;
    element.preload = 'auto';
    if ('playsInline' in element) (element as HTMLVideoElement).playsInline = true;
  }

  private applyFaders() {
    if (this.voiceTrack) this.voiceTrack.gain.gain.value = toLinearGain(this.faders.voice, this.voicePreGain);
    if (this.referenceTrack) this.referenceTrack.gain.gain.value = toLinearGain(this.faders.reference, this.referencePreGain);
  }

  private disconnectTrack(kind: DuetTrackKind) {
    const track = kind === 'voice' ? this.voiceTrack : this.referenceTrack;
    if (!track) return;
    if (kind === 'voice') {
      this.stopVoiceBuffer();
      this.voiceBuffer = null;
    }
    if (kind === 'reference') {
      this.stopReferenceBuffer();
      this.referenceBuffer = null;
    }
    try { track.source?.disconnect(); } catch {}
    try { track.gain.disconnect(); } catch {}
    try { track.analyser.disconnect(); } catch {}
    if (track.element) {
      try { track.element.pause(); } catch {}
      track.element.volume = 1;
    }
    if (kind === 'voice') this.voiceTrack = null;
    else this.referenceTrack = null;
  }
}
