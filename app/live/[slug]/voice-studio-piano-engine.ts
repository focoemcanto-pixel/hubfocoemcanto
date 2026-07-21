const SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

const SAMPLE_POINTS = [
  [21, 'A0.mp3'], [24, 'C1.mp3'], [27, 'Ds1.mp3'], [30, 'Fs1.mp3'],
  [33, 'A1.mp3'], [36, 'C2.mp3'], [39, 'Ds2.mp3'], [42, 'Fs2.mp3'],
  [45, 'A2.mp3'], [48, 'C3.mp3'], [51, 'Ds3.mp3'], [54, 'Fs3.mp3'],
  [57, 'A3.mp3'], [60, 'C4.mp3'], [63, 'Ds4.mp3'], [66, 'Fs4.mp3'],
  [69, 'A4.mp3'], [72, 'C5.mp3'], [75, 'Ds5.mp3'], [78, 'Fs5.mp3'],
  [81, 'A5.mp3'], [84, 'C6.mp3'], [87, 'Ds6.mp3'], [90, 'Fs6.mp3'],
  [93, 'A6.mp3'], [96, 'C7.mp3'], [99, 'Ds7.mp3'], [102, 'Fs7.mp3'],
  [105, 'A7.mp3'], [108, 'C8.mp3'],
] as const;

type SamplePoint = (typeof SAMPLE_POINTS)[number];
type Voice = { source: AudioBufferSourceNode; gain: GainNode; context: AudioContext };
type MasterChain = { input: GainNode; compressor: DynamicsCompressorNode };
export type ScheduledPianoVoice = { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();
const voices = new Map<number, Voice>();
const masters = new WeakMap<AudioContext, MasterChain>();

function nearestSample(note: number): SamplePoint {
  return SAMPLE_POINTS.reduce((best, candidate) =>
    Math.abs(candidate[0] - note) < Math.abs(best[0] - note) ? candidate : best,
  SAMPLE_POINTS[0]);
}

async function loadBuffer(context: AudioContext, fileName: string) {
  const cached = buffers.get(fileName);
  if (cached) return cached;
  const pending = loading.get(fileName);
  if (pending) return pending;

  const request = fetch(`${SAMPLE_BASE_URL}${fileName}`)
    .then(response => {
      if (!response.ok) throw new Error(`Não foi possível carregar ${fileName}.`);
      return response.arrayBuffer();
    })
    .then(data => context.decodeAudioData(data.slice(0)))
    .then(buffer => {
      buffers.set(fileName, buffer);
      return buffer;
    })
    .finally(() => loading.delete(fileName));

  loading.set(fileName, request);
  return request;
}

function masterChain(context: AudioContext) {
  const existing = masters.get(context);
  if (existing) return existing;

  const input = context.createGain();
  const compressor = context.createDynamicsCompressor();
  input.gain.value = 0.78;
  compressor.threshold.value = -10;
  compressor.knee.value = 10;
  compressor.ratio.value = 1.55;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.3;
  input.connect(compressor).connect(context.destination);

  const chain = { input, compressor };
  masters.set(context, chain);
  return chain;
}

export async function preloadVoiceStudioPiano(context: AudioContext) {
  const centralSamples = ['C3.mp3', 'Fs3.mp3', 'A3.mp3', 'C4.mp3', 'Ds4.mp3', 'Fs4.mp3', 'A4.mp3', 'C5.mp3'];
  await Promise.all(centralSamples.map(file => loadBuffer(context, file)));
}

export async function preloadVoiceStudioPianoNotes(context: AudioContext, notes: Iterable<number>) {
  const files = new Set<string>();
  for (const note of notes) files.add(nearestSample(note)[1]);
  await Promise.all(Array.from(files).map(file => loadBuffer(context, file)));
}

export function scheduleVoiceStudioPianoNote(
  context: AudioContext,
  note: number,
  velocity: number,
  when: number,
  duration: number,
  volume = 1,
): ScheduledPianoVoice | null {
  const [sampleMidi, fileName] = nearestSample(note);
  const buffer = buffers.get(fileName);
  if (!buffer) return null;

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const master = masterChain(context);
  const start = Math.max(context.currentTime + 0.002, when);
  const safeDuration = Math.max(0.04, duration);
  const release = Math.min(0.22, Math.max(0.08, safeDuration * 0.22));
  const end = start + safeDuration;

  source.buffer = buffer;
  source.playbackRate.value = Math.pow(2, (note - sampleMidi) / 12);
  filter.type = 'lowpass';
  filter.frequency.value = 14500;
  filter.Q.value = 0.25;

  const normalizedVelocity = Math.max(0, Math.min(1, velocity));
  const level = Math.max(0.0001, (0.055 + Math.pow(normalizedVelocity, 1.5) * 0.62) * Math.max(0, volume));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * 0.86), Math.min(end, start + 0.18));
  gain.gain.setValueAtTime(Math.max(0.0001, level * 0.86), Math.max(start + 0.18, end - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, end + release);

  source.connect(filter).connect(gain).connect(master.input);
  source.start(start);
  source.stop(end + release + 0.04);
  return { source, filter, gain };
}

export function stopVoiceStudioPianoNote(note: number, release = 0.16) {
  const voice = voices.get(note);
  if (!voice) return;
  voices.delete(note);
  const now = voice.context.currentTime;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    voice.source.stop(now + release + 0.08);
  } catch {}
}

export function stopAllVoiceStudioPianoNotes() {
  Array.from(voices.keys()).forEach(note => stopVoiceStudioPianoNote(note, 0.1));
}

export async function startVoiceStudioPianoNote(context: AudioContext, note: number, velocity = 1) {
  stopVoiceStudioPianoNote(note, 0.035);
  if (context.state !== 'running') await context.resume().catch(() => undefined);

  const [sampleMidi, fileName] = nearestSample(note);
  const buffer = await loadBuffer(context, fileName);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const master = masterChain(context);

  source.buffer = buffer;
  source.playbackRate.value = Math.pow(2, (note - sampleMidi) / 12);
  filter.type = 'lowpass';
  filter.frequency.value = 14500;
  filter.Q.value = 0.25;

  const now = context.currentTime;
  const normalizedVelocity = Math.max(0, Math.min(1, velocity));
  const level = 0.07 + Math.pow(normalizedVelocity, 1.45) * 0.66;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(level, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(level * 0.88, now + 0.18);

  source.connect(filter).connect(gain).connect(master.input);
  source.onended = () => {
    if (voices.get(note)?.source === source) voices.delete(note);
  };
  voices.set(note, { source, gain, context });
  source.start();
}