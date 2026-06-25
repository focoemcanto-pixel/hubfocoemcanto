const SAMPLE_BASE_URL = 'https://raw.githubusercontent.com/focoemcanto-pixel/piano-sound-samples/master/sound_keyboard_staff/';
const REFERENCE_SAMPLE = 'C.mp3';
const REFERENCE_MIDI = 36;

let referenceBuffer: AudioBuffer | null = null;
let referenceLoading: Promise<AudioBuffer> | null = null;
const activeSources = new Set<AudioBufferSourceNode>();
const activeGains = new Set<GainNode>();

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

async function loadReferenceSample(context: AudioContext) {
  if (referenceBuffer) return referenceBuffer;
  if (referenceLoading) return referenceLoading;

  referenceLoading = fetch(`${SAMPLE_BASE_URL}${REFERENCE_SAMPLE}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Sample não encontrado: ${REFERENCE_SAMPLE}`);
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
    .then((buffer) => {
      referenceBuffer = buffer;
      referenceLoading = null;
      return buffer;
    })
    .catch((error) => {
      referenceLoading = null;
      throw error;
    });

  return referenceLoading;
}

export async function preloadPianoSamples(context: AudioContext) {
  await loadReferenceSample(context);
}

export function stopPianoSamples(context?: AudioContext) {
  const now = context?.currentTime ?? 0;
  activeGains.forEach((gain) => {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.018);
    } catch {}
  });
  window.setTimeout(() => {
    activeSources.forEach((source) => {
      try { source.stop(); } catch {}
    });
    activeSources.clear();
    activeGains.clear();
  }, 90);
}

export async function playPianoSample(context: AudioContext, midiValue: number, at: number, end: number, velocity = 1) {
  const buffer = await loadReferenceSample(context);
  const source = context.createBufferSource();
  const gain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const body = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const air = context.createBiquadFilter();

  source.buffer = buffer;
  source.playbackRate.value = midiToFrequency(midiValue) / midiToFrequency(REFERENCE_MIDI);

  body.type = 'lowshelf';
  body.frequency.value = 180;
  body.gain.value = 2.7;

  presence.type = 'peaking';
  presence.frequency.value = 2400;
  presence.Q.value = 0.9;
  presence.gain.value = 1.6;

  air.type = 'highshelf';
  air.frequency.value = 5400;
  air.gain.value = -1.5;

  compressor.threshold.value = -7;
  compressor.knee.value = 16;
  compressor.ratio.value = 2.6;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.28;

  const startAt = Math.max(context.currentTime + 0.008, at);
  const noteLength = Math.max(0.42, end - startAt);
  const releaseAt = startAt + Math.min(noteLength, 0.72);
  const stopAt = Math.max(startAt + 0.72, end + 0.42);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(1.35 * velocity, startAt + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.72 * velocity, startAt + 0.18);
  gain.gain.setValueAtTime(0.5 * velocity, releaseAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  source.connect(body);
  body.connect(presence);
  presence.connect(air);
  air.connect(gain);
  gain.connect(compressor);
  compressor.connect(context.destination);

  activeSources.add(source);
  activeGains.add(gain);
  source.onended = () => {
    activeSources.delete(source);
    activeGains.delete(gain);
  };

  source.start(startAt);
  source.stop(stopAt + 0.06);
}
