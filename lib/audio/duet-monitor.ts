type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function makeAudioContext() {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx({ latencyHint: 'playback', sampleRate: 48000 });
}

function capturedReferenceStream(reference: HTMLVideoElement) {
  const video = reference as CapturableVideo;
  const capture = video.captureStream || video.mozCaptureStream;
  if (!capture) return null;
  try {
    const stream = capture.call(video);
    return stream.getAudioTracks().length ? stream : null;
  } catch {
    return null;
  }
}

export function buildDuetMonitorAudio(reference: HTMLVideoElement, stream: MediaStream) {
  const context = makeAudioContext();
  if (!context) return stream.getAudioTracks();

  context.resume().catch(() => undefined);
  const destination = context.createMediaStreamDestination();
  const referenceDestination = context.createMediaStreamDestination();
  const master = context.createGain();
  master.gain.value = 0.96;
  master.connect(destination);

  try {
    const microphone = context.createMediaStreamSource(stream);
    const micGain = context.createGain();
    micGain.gain.value = 0.96;
    microphone.connect(micGain).connect(master);
  } catch {}

  const referenceStream = capturedReferenceStream(reference);
  if (referenceStream) {
    try {
      const referenceSource = context.createMediaStreamSource(referenceStream);
      const recordGain = context.createGain();
      const isolatedGain = context.createGain();
      recordGain.gain.value = 0.98;
      isolatedGain.gain.value = 1;
      referenceSource.connect(recordGain).connect(master);
      referenceSource.connect(isolatedGain).connect(referenceDestination);
    } catch {}
  } else {
    try {
      const source = context.createMediaElementSource(reference);
      const monitorGain = context.createGain();
      const recordGain = context.createGain();
      const isolatedGain = context.createGain();
      monitorGain.gain.value = 1;
      recordGain.gain.value = 0.98;
      isolatedGain.gain.value = 1;
      source.connect(monitorGain).connect(context.destination);
      source.connect(recordGain).connect(master);
      source.connect(isolatedGain).connect(referenceDestination);
    } catch {}
  }

  return {
    tracks: destination.stream.getAudioTracks(),
    referenceTracks: referenceDestination.stream.getAudioTracks(),
    context,
  };
}
