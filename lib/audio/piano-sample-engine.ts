const SAMPLE_BASE_URL = 'https://raw.githubusercontent.com/focoemcanto-pixel/piano-sound-samples/master/sound_keyboard_staff/';
const REFERENCE_SAMPLE = 'C.mp3';
const REFERENCE_MIDI = 48;

let referenceBuffer: AudioBuffer | null = null;
let referenceLoading: Promise<AudioBuffer> | null = null;

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

export async function playPianoSample(context: AudioContext, midiValue: number, at: number, end: number, velocity = 1) {
  const buffer = await loadReferenceSample(context);
  const source = context.createBufferSource();
  const gain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const body = context.createBiquadFilter();
  const presence = context.createBiquadFilter();

  source.buffer = buffer;
  source.playbackRate.value = midiToFrequency(midiValue) / midiToFrequency(REFERENCE_MIDI);

  body.type = 'lowshelf';
  body.frequency.value = 190;
  body.gain.value = 2.2;

  presence.type = 'peaking';
  presence.frequency.value = 2800;
  presence.Q.value = 0.8;
  presence.gain.value = 2.2;

  compressor.threshold.value = -9;
  compressor.knee.value = 14;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.16;

  const startAt = Math.max(context.currentTime + 0.008, at);
  const stopAt = Math.max(startAt + 0.26, end + 0.08);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(1.45 * velocity, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.62 * velocity, startAt + 0.16);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  source.connect(body);
  body.connect(presence);
  presence.connect(gain);
  gain.connect(compressor);
  compressor.connect(context.destination);

  source.start(startAt);
  source.stop(stopAt + 0.05);
}
