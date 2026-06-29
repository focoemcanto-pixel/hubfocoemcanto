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

function connectReferenceElement(reference: HTMLVideoElement, context: AudioContext, master: GainNode, referenceDestination: MediaStreamAudioDestinationNode) {
  const source = context.createMediaElementSource(reference);
  const monitorGain = context.createGain();
  const recordGain = context.createGain();
  const isolatedGain = context.createGain();

  // Quando um MediaElementAudioSourceNode é criado, o áudio nativo do <video> passa a sair pelo grafo.
  // Por isso ele PRECISA ser conectado também ao context.destination, senão o cantor ouve a referência muda.
  monitorGain.gain.value = 1;
  recordGain.gain.value = 0.9;
  isolatedGain.gain.value = 1;

  source.connect(monitorGain).connect(context.destination);
  source.connect(recordGain).connect(master);
  source.connect(isolatedGain).connect(referenceDestination);
  return true;
}

function connectReferenceCapture(reference: HTMLVideoElement, context: AudioContext, master: GainNode, referenceDestination: MediaStreamAudioDestinationNode) {
  const referenceStream = capturedReferenceStream(reference);
  if (!referenceStream) return false;

  const source = context.createMediaStreamSource(referenceStream);
  const recordGain = context.createGain();
  const isolatedGain = context.createGain();
  recordGain.gain.value = 0.9;
  isolatedGain.gain.value = 1;
  source.connect(recordGain).connect(master);
  source.connect(isolatedGain).connect(referenceDestination);
  return true;
}

export function buildDuetMonitorAudio(reference: HTMLVideoElement, stream: MediaStream): MediaStreamTrack[] | DuetMonitorResult {
  const context = makeAudioContext();
  if (!context) return stream.getAudioTracks();

  context.resume().catch(() => undefined);
  const destination = context.createMediaStreamDestination();
  const referenceDestination = context.createMediaStreamDestination();
  const master = context.createGain();
  master.gain.value = 0.9;
  master.connect(destination);

  try {
    const microphone = context.createMediaStreamSource(stream);
    const micGain = context.createGain();
    micGain.gain.value = 0.9;
    microphone.connect(micGain).connect(master);
  } catch {}

  // A referência precisa entrar em dois lugares:
  // 1) no master, para existir no vídeo gravado;
  // 2) isolada, para a tela de mix conseguir controlar voz e referência separadamente depois.
  reference.muted = false;
  let connected = false;
  try { connected = connectReferenceElement(reference, context, master, referenceDestination); } catch {}
  if (!connected) {
    try { connected = connectReferenceCapture(reference, context, master, referenceDestination); } catch {}
  }

  return {
    tracks: destination.stream.getAudioTracks(),
    referenceTracks: referenceDestination.stream.getAudioTracks(),
    context,
  };
}
