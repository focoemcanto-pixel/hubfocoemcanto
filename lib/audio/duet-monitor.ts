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

function connectReferenceCapture(referenceStream: MediaStream, context: AudioContext, master: GainNode) {
  const source = context.createMediaStreamSource(referenceStream);
  const recordGain = context.createGain();
  recordGain.gain.value = 0.92;
  source.connect(recordGain).connect(master);
}

function connectReferenceElement(reference: HTMLVideoElement, context: AudioContext, master: GainNode, referenceDestination: MediaStreamAudioDestinationNode) {
  const source = context.createMediaElementSource(reference);
  const monitorGain = context.createGain();
  const recordGain = context.createGain();
  const isolatedGain = context.createGain();

  monitorGain.gain.value = 1;
  recordGain.gain.value = 0.92;
  isolatedGain.gain.value = 1;

  source.connect(monitorGain).connect(context.destination);
  source.connect(recordGain).connect(master);
  source.connect(isolatedGain).connect(referenceDestination);
}

export function buildDuetMonitorAudio(reference: HTMLVideoElement, stream: MediaStream): MediaStreamTrack[] | DuetMonitorResult {
  const context = makeAudioContext();
  if (!context) return stream.getAudioTracks();

  context.resume().catch(() => undefined);
  const destination = context.createMediaStreamDestination();
  const referenceDestination = context.createMediaStreamDestination();
  const master = context.createGain();
  master.gain.value = 0.95;
  master.connect(destination);

  try {
    const microphone = context.createMediaStreamSource(stream);
    const micGain = context.createGain();
    micGain.gain.value = 0.95;
    microphone.connect(micGain).connect(master);
  } catch {}

  reference.muted = false;

  // Preferimos captureStream para criar a faixa separada da referência.
  // Essa track NÃO depende do MediaStreamDestination do AudioContext, então continua
  // entregando chunks mesmo quando o contexto usado para monitorar/mixar é fechado.
  const captured = capturedReferenceStream(reference);
  if (captured) {
    try { connectReferenceCapture(captured, context, master); } catch {}
    return {
      tracks: destination.stream.getAudioTracks(),
      referenceTracks: captured.getAudioTracks(),
      context,
    };
  }

  try { connectReferenceElement(reference, context, master, referenceDestination); } catch {}
  return {
    tracks: destination.stream.getAudioTracks(),
    referenceTracks: referenceDestination.stream.getAudioTracks(),
    context,
  };
}
