import {
  createVoiceStudioBrowserRecordingAdapter,
  type VoiceStudioBrowserRecordingAdapter,
  type VoiceStudioBrowserRecordingResult,
} from './voice-studio-browser-recording-adapter';

export type VoiceStudioBrowserAudioInputFrame = {
  meter: number;
  peak: number;
};

export type VoiceStudioBrowserAudioInputSession = {
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  stop(): Promise<VoiceStudioBrowserRecordingResult>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
};

export type CreateVoiceStudioBrowserAudioInputSessionOptions = {
  audioContext: AudioContext;
  constraints?: MediaStreamConstraints;
  monitor?: boolean;
  monitorGain?: number;
  onFrame?: (frame: VoiceStudioBrowserAudioInputFrame) => void;
};

export async function createVoiceStudioBrowserAudioInputSession(
  options: CreateVoiceStudioBrowserAudioInputSessionOptions,
): Promise<VoiceStudioBrowserAudioInputSession> {
  const recording = await createVoiceStudioBrowserRecordingAdapter({ constraints: options.constraints });
  const source = options.audioContext.createMediaStreamSource(recording.stream);
  const analyser = options.audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const monitor = options.monitor ? options.audioContext.createGain() : null;
  if (monitor) {
    monitor.gain.value = options.monitorGain ?? 0.75;
    source.connect(monitor).connect(options.audioContext.destination);
  }

  let animationFrame: number | null = null;
  let disposed = false;
  const samples = new Uint8Array(analyser.frequencyBinCount);

  const draw = () => {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    let peak = 0;
    for (const sample of samples) {
      const normalized = Math.abs((sample - 128) / 128);
      sum += normalized * normalized;
      peak = Math.max(peak, normalized);
    }
    options.onFrame?.({
      meter: Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 3),
      peak: Math.max(0.03, peak),
    });
    animationFrame = requestAnimationFrame(draw);
  };

  const disposeGraph = () => {
    if (disposed) return;
    disposed = true;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    try { source.disconnect(); } catch {}
    try { analyser.disconnect(); } catch {}
    try { monitor?.disconnect(); } catch {}
  };

  draw();

  return {
    recorder: recording.recorder,
    stream: recording.stream,
    async stop() {
      try {
        return await recording.stop();
      } finally {
        disposeGraph();
      }
    },
    async cancel() {
      try {
        await recording.cancel();
      } finally {
        disposeGraph();
      }
    },
    async dispose() {
      try {
        await recording.dispose();
      } finally {
        disposeGraph();
      }
    },
  };
}
