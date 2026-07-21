const SAMPLE_BASE_URL = 'https://raw.github' + 'usercontent.com/focoemcanto-pixel/piano-sound-samples/master/sound_keyboard_staff/';

const cache = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();
const activeSources = new Set<AudioBufferSourceNode>();
const activeGains = new Set<GainNode>();
const liveVoices = new Map<number, { source: AudioBufferSourceNode; gain: GainNode; context: AudioContext }>();

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

function createPianoChain(context: AudioContext, velocity: number) {
  const gain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const body = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const air = context.createBiquadFilter();

  body.type = 'lowshelf';
  body.frequency.value = 170;
  body.gain.value = 2.4;

  presence.type = 'peaking';
  presence.frequency.value = 2300;
  presence.Q.value = 0.85;
  presence.gain.value = 0.8;

  air.type = 'highshelf';
  air.frequency.value = 5600;
  air.gain.value = -1.8;

  compressor.threshold.value = -8;
  compressor.knee.value = 18;
  compressor.ratio.value = 2.1;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.48;

  gain.gain.value = Math.max(0.05, velocity);
  body.connect(presence);
  presence.connect(air);
  air.connect(gain);
  gain.connect(compressor);
  compressor.connect(context.destination);

  return { body, gain };
}

export async function preloadPianoSamples(context: AudioContext, midis?: number[]) {
  const targets = midis?.length ? midis : Array.from({ length: 37 }, (_, index) => 48 + index);
  const files = Array.from(new Set(targets.map((midi) => closestSample(midi).file)));
  await Promise.allSettled(files.map((file) => loadSample(context, file)));
}

export function stopPianoLiveNote(midiValue: number, releaseSeconds = 0.42) {
  const voice = liveVoices.get(midiValue);
  if (!voice) return;
  liveVoices.delete(midiValue);
  const now = voice.context.currentTime;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds);
    voice.source.stop(now + releaseSeconds + 0.08);
  } catch {}
}

export function stopAllPianoLiveNotes() {
  Array.from(liveVoices.keys()).forEach((note) => stopPianoLiveNote(note, 0.12));
}

export async function startPianoLiveNote(context: AudioContext, midiValue: number, velocity = 1) {
  stopPianoLiveNote(midiValue, 0.06);
  const sample = closestSample(midiValue);
  let buffer: AudioBuffer;
  try {
    buffer = await loadSample(context, sample.file);
  } catch {
    const fallback = closestSample(60);
    buffer = await loadSample(context, fallback.file);
  }

  if (context.state !== 'running') await context.resume().catch(() => undefined);
  const source = context.createBufferSource();
  const { body, gain } = createPianoChain(context, Math.max(0.08, Math.min(1.2, velocity)));
  source.buffer = buffer;
  source.playbackRate.value = midiToFrequency(midiValue) / midiToFrequency(sample.midi);
  source.connect(body);
  source.onended = () => {
    const current = liveVoices.get(midiValue);
    if (current?.source === source) liveVoices.delete(midiValue);
  };
  liveVoices.set(midiValue, { source, gain, context });
  source.start();
}

export function stopPianoSamples(context?: AudioContext) {
  stopAllPianoLiveNotes();
  const now = context?.currentTime ?? 0;
  activeGains.forEach((gain) => {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    } catch {}
  });
  window.setTimeout(() => {
    activeSources.forEach((source) => {
      try { source.stop(); } catch {}
    });
    activeSources.clear();
    activeGains.clear();
  }, 1250);
}

export async function playPianoSample(context: AudioContext, midiValue: number, at: number, end: number, velocity = 1) {
  let sample = closestSample(midiValue);
  let buffer: AudioBuffer;

  try {
    buffer = await loadSample(context, sample.file);
  } catch {
    sample = closestSample(60);
    buffer = await loadSample(context, sample.file);
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
  body.gain.value = 2.4;

  presence.type = 'peaking';
  presence.frequency.value = 2300;
  presence.Q.value = 0.85;
  presence.gain.value = 0.8;

  air.type = 'highshelf';
  air.frequency.value = 5600;
  air.gain.value = -1.8;

  compressor.threshold.value = -8;
  compressor.knee.value = 18;
  compressor.ratio.value = 2.1;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.48;

  const startAt = Math.max(context.currentTime + 0.01, at);
  const requestedLength = Math.max(3.4, end - startAt);
  const playbackRate = Math.max(0.35, source.playbackRate.value);
  const availableLength = Math.max(2.4, buffer.duration / playbackRate - 0.18);
  const fadeSeconds = 1.35;
  const audibleUntil = startAt + Math.min(requestedLength, availableLength);
  const fadeStart = Math.max(startAt + 1.1, audibleUntil - fadeSeconds);
  const stopAt = audibleUntil + 0.55;

  gain.gain.cancelScheduledValues(startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(1.08 * velocity, startAt + 0.024);
  gain.gain.exponentialRampToValueAtTime(0.74 * velocity, startAt + 0.26);
  gain.gain.setValueAtTime(0.48 * velocity, fadeStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, audibleUntil);

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
  source.stop(stopAt);
}
