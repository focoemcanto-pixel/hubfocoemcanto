const SAMPLE_BASE_URL = 'https://raw.githubusercontent.com/focoemcanto-pixel/piano-sound-samples/master/sound_keyboard_staff/';

const cache = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();
const activeSources = new Set<AudioBufferSourceNode>();
const activeGains = new Set<GainNode>();

type SampleRef = { midi: number; file: string };

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function buildSampleRefs(): SampleRef[] {
  const refs: SampleRef[] = [];
  const upper = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  const lower = ['cc', 'ccs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'aa', 'aas', 'b'];

  upper.forEach((name, index) => refs.push({ midi: 36 + index, file: `${name}.mp3` }));
  lower.forEach((name, index) => refs.push({ midi: 48 + index, file: `${name}.mp3` }));

  for (let octaveIndex = 1; octaveIndex <= 5; octaveIndex += 1) {
    lower.forEach((name, index) => refs.push({ midi: 48 + octaveIndex * 12 + index, file: `${name}${octaveIndex}.mp3` }));
  }

  return refs;
}

const SAMPLE_REFS = buildSampleRefs();
const FALLBACK_SAMPLE = SAMPLE_REFS.find((sample) => sample.midi === 60) ?? SAMPLE_REFS[0];

function closestSample(midiValue: number) {
  return SAMPLE_REFS.reduce((best, sample) => {
    const currentDistance = Math.abs(sample.midi - midiValue);
    const bestDistance = Math.abs(best.midi - midiValue);
    return currentDistance < bestDistance ? sample : best;
  }, FALLBACK_SAMPLE);
}

async function loadSample(context: AudioContext, fileName: string) {
  const cached = cache.get(fileName);
  if (cached) return cached;

  const pending = loading.get(fileName);
  if (pending) return pending;

  const request = fetch(`${SAMPLE_BASE_URL}${fileName}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Sample não encontrado: ${fileName}`);
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
    .then((buffer) => {
      cache.set(fileName, buffer);
      loading.delete(fileName);
      return buffer;
    })
    .catch((error) => {
      loading.delete(fileName);
      throw error;
    });

  loading.set(fileName, request);
  return request;
}

export async function preloadPianoSamples(context: AudioContext, midis?: number[]) {
  const targets = midis?.length ? midis : [48, 52, 55, 60, 64, 67, 72, 76, 79];
  const files = Array.from(new Set(targets.map((midi) => closestSample(midi).file)));
  await Promise.allSettled(files.map((file) => loadSample(context, file)));
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
  const sample = closestSample(midiValue);
  let buffer: AudioBuffer;

  try {
    buffer = await loadSample(context, sample.file);
  } catch {
    const fallback = closestSample(60);
    buffer = await loadSample(context, fallback.file);
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const body = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const air = context.createBiquadFilter();

  source.buffer = buffer;
  source.playbackRate.value = midiToFrequency(midiValue) / midiToFrequency(sample.midi);

  body.type = 'lowshelf';
  body.frequency.value = 170;
  body.gain.value = 2.2;

  presence.type = 'peaking';
  presence.frequency.value = 2500;
  presence.Q.value = 0.85;
  presence.gain.value = 1.1;

  air.type = 'highshelf';
  air.frequency.value = 5600;
  air.gain.value = -1.2;

  compressor.threshold.value = -7;
  compressor.knee.value = 16;
  compressor.ratio.value = 2.4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.26;

  const startAt = Math.max(context.currentTime + 0.008, at);
  const noteLength = Math.max(0.42, end - startAt);
  const releaseAt = startAt + Math.min(noteLength, 0.78);
  const stopAt = Math.max(startAt + 0.76, end + 0.46);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(1.32 * velocity, startAt + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.68 * velocity, startAt + 0.2);
  gain.gain.setValueAtTime(0.46 * velocity, releaseAt);
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
