export function buildDuetMonitorAudio(reference: HTMLVideoElement, stream: MediaStream) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return stream.getAudioTracks();

  const context = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
  const destination = context.createMediaStreamDestination();

  try {
    const microphone = context.createMediaStreamSource(stream);
    microphone.connect(destination);
  } catch {}

  try {
    const referenceSource = context.createMediaElementSource(reference);
    const referenceGain = context.createGain();
    referenceGain.gain.value = 0.45;
    referenceSource.connect(referenceGain).connect(destination);
    referenceGain.connect(context.destination);
  } catch {}

  return { tracks: destination.stream.getAudioTracks(), context };
}
