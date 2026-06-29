type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

type DuetMonitorResult = {
  tracks: MediaStreamTrack[];
  referenceTracks: MediaStreamTrack[];
  context: AudioContext;
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

export function buildDuetMonitorAudio(reference: HTMLVideoElement, stream: MediaStream): MediaStreamTrack[] | DuetMonitorResult {
  const context = makeAudioContext();
  if (!context) return stream.getAudioTracks();

  context.resume().catch(() => undefined);
  const destination = context.createMediaStreamDestination();
  const referenceDestination = context.createMediaStreamDestination();
  const master = context.createGain();
  master.gain.value = 0.92;
  master.connect(destination);

  try {
    const microphone = context.createMediaStreamSource(stream);
    const micGain = context.createGain();
    micGain.gain.value = 0.88;
    microphone.connect(micGain).connect(master);
  } catch {}

  // Mantém a referência audível pelo player nativo durante a gravação.
  // Isso evita o bug de alguns navegadores em que o monitor via AudioContext fica mudo.
  reference.muted = false;

  const referenceStream = capturedReferenceStream(reference);
  if (referenceStream) {
    try {
      const referenceSource = context.createMediaStreamSource(referenceStream);
      const recordGain = context.createGain();
      const isolatedGain = context.createGain();
      recordGain.gain.value = 0.82;
      isolatedGain.gain.value = 1;
      referenceSource.connect(recordGain).connect(master);
      referenceSource.connect(isolatedGain).connect(referenceDestination);
    } catch {}
  } else {
    try {
      const source = context.createMediaElementSource(reference);
      const recordGain = context.createGain();
      const isolatedGain = context.createGain();
      recordGain.gain.value = 0.82;
      isolatedGain.gain.value = 1;
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
