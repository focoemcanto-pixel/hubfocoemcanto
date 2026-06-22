export function buildDuetMonitorAudio(reference: HTMLVideoElement, stream: MediaStream) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return stream.getAudioTracks();

  const context = new AudioCtx({ latencyHint: 'playback' });
  const destination = context.createMediaStreamDestination();
  const referenceDestination = context.createMediaStreamDestination();

  try {
    const microphone = context.createMediaStreamSource(stream);
    microphone.connect(destination);
  } catch {}

  try {
    const source = context.createMediaElementSource(reference);
    const monitorGain = context.createGain();
    const recordGain = context.createGain();
    monitorGain.gain.value = 1;
    recordGain.gain.value = 1;
    source.connect(monitorGain).connect(context.destination);
    source.connect(recordGain).connect(referenceDestination);
  } catch {}

  return {
    tracks: destination.stream.getAudioTracks(),
    referenceTracks: referenceDestination.stream.getAudioTracks(),
    context,
  };
}
