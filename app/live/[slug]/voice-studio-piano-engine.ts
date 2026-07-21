const SAMPLE_URL = 'https://raw.githubusercontent.com/focoemcanto-pixel/piano-sound-samples/master/sound_keyboard_staff/C.mp3';
const SAMPLE_MIDI = 60;

let loading: Promise<AudioBuffer> | null = null;
let cached: AudioBuffer | null = null;
const voices = new Map<number, { source: AudioBufferSourceNode; gain: GainNode; context: AudioContext }>();

function frequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

async function sample(context: AudioContext) {
  if (cached) return cached;
  if (!loading) {
    loading = fetch(SAMPLE_URL)
      .then(response => {
        if (!response.ok) throw new Error('Não foi possível carregar o piano real.');
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data.slice(0)))
      .then(buffer => {
        cached = buffer;
        return buffer;
      })
      .finally(() => { loading = null; });
  }
  return loading;
}

export async function preloadVoiceStudioPiano(context: AudioContext) {
  await sample(context);
}

export function stopVoiceStudioPianoNote(note: number, release = 0.12) {
  const voice = voices.get(note);
  if (!voice) return;
  voices.delete(note);
  const now = voice.context.currentTime;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    voice.source.stop(now + release + 0.05);
  } catch {}
}

export function stopAllVoiceStudioPianoNotes() {
  Array.from(voices.keys()).forEach(note => stopVoiceStudioPianoNote(note, 0.08));
}

export async function startVoiceStudioPianoNote(context: AudioContext, note: number, velocity = 1) {
  stopVoiceStudioPianoNote(note, 0.04);
  if (context.state !== 'running') await context.resume().catch(() => undefined);
  const buffer = await sample(context);
  const source = context.createBufferSource();
  const gain = context.createGain();
  const low = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();

  source.buffer = buffer;
  source.playbackRate.value = frequency(note) / frequency(SAMPLE_MIDI);
  low.type = 'lowshelf';
  low.frequency.value = 180;
  low.gain.value = 1.8;
  compressor.threshold.value = -10;
  compressor.knee.value = 16;
  compressor.ratio.value = 2;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.38;

  const now = context.currentTime;
  const level = Math.max(0.045, Math.min(0.9, velocity * 0.62));
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(level * 0.74, now + 0.22);

  source.connect(low).connect(gain).connect(compressor).connect(context.destination);
  source.onended = () => {
    if (voices.get(note)?.source === source) voices.delete(note);
  };
  voices.set(note, { source, gain, context });
  source.start();
}