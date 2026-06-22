export function buildDuetMonitorAudio(reference: HTMLVideoElement, stream: MediaStream) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return stream.getAudioTracks();

  const context = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
  const destination = context.createMediaStreamDestination();
  const referenceDestination = context.createMediaStreamDestination();

  try {
    const microphone = context.createMediaStreamSource(stream);
    microphone.connect(destination);
  } catch {}

  try {
    const referenceSource = context.createMediaElementSource(reference);
    const referenceGain = context.createGain();
    const referenceRecordGain = context.createGain();
    referenceGain.gain.value = 0.45;
    referenceRecordGain.gain.value = 1;
    referenceSource.connect(referenceGain).connect(destination);
    referenceSource.connect(referenceRecordGain).connect(referenceDestination);
    referenceGain.connect(context.destination);
  } catch {}

  return {
    tracks: destination.stream.getAudioTracks(),
    referenceTracks: referenceDestination.stream.getAudioTracks(),
    context,
  };
}
