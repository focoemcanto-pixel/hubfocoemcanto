const SAMPLE_BASE_URL = 'https://raw.githubusercontent.com/focoemcanto-pixel/piano-sound-samples/master/sound_keyboard_staff/';

const NOTE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
const LOWER_NOTE_NAMES = ['cc', 'd', 'e', 'f', 'g', 'aa', 'b'];
const LOWER_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];
const cache = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function safeMidi(midi: number) {
  return Math.max(21, Math.min(108, Math.round(midi)));
}

function sampleNameForMidi(midiValue: number) {
  const midi = safeMidi(midiValue);
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[pitchClass];

  if (octave === 0) return `${note}_2.mp3`;
  if (octave === 1) return `${note}_1.mp3`;
  if (octave === 2) return `${note}.mp3`;

  const lowerIndex = LOWER_PITCH_CLASSES.indexOf(pitchClass);
  const lowerBase = lowerIndex >= 0 ? LOWER_NOTE_NAMES[lowerIndex] : NOTE_NAMES[pitchClass].toLowerCase();

  if (octave === 3) return `${lowerBase}.mp3`;
  return `${lowerBase}${octave - 3}.mp3`;
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

export async function preloadPianoSamples(context: AudioContext, midis: number[]) {
  const files = Array.from(new Set(midis.map(sampleNameForMidi)));
  await Promise.allSettled(files.map((file) => loadSample(context, file)));
}

export async function playPianoSample(context: AudioContext, midiValue: number, at: number, end: number, velocity = 1) {
  const midi = safeMidi(midiValue);
  const fileName = sampleNameForMidi(midi);
  const buffer = await loadSample(context, fileName);

  const source = context.createBufferSource();
  const gain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const body = context.createBiquadFilter();
  const presence = context.createBiquadFilter();

  source.buffer = buffer;
  source.playbackRate.value = midiToFrequency(midiValue) / midiToFrequency(midi);

  body.type = 'lowshelf';
  body.frequency.value = 180;
  body.gain.value = 2.8;

  presence.type = 'peaking';
  presence.frequency.value = 2600;
  presence.Q.value = 0.8;
  presence.gain.value = 2.6;

  compressor.threshold.value = -8;
  compressor.knee.value = 14;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;

  const startAt = Math.max(context.currentTime + 0.006, at);
  const stopAt = Math.max(startAt + 0.22, end + 0.12);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(1.35 * velocity, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.55 * velocity, startAt + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  source.connect(body);
  body.connect(presence);
  presence.connect(gain);
  gain.connect(compressor);
  compressor.connect(context.destination);

  source.start(startAt);
  source.stop(stopAt + 0.05);
}
