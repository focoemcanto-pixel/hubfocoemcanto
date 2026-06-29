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

function connectReferenceFromElement(reference: HTMLVideoElement, context: AudioContext, master: GainNode, referenceDestination: MediaStreamAudioDestinationNode) {
  const source = context.createMediaElementSource(reference);
  const monitorGain = context.createGain();
  const recordGain = context.createGain();
  const isolatedGain = context.createGain();

  // A referência é monitorada limpa, sem compressor, sem AGC e sem noise suppression.
  // O ganho de gravação fica levemente abaixo de 0dB para preservar headroom e evitar clipping ao somar com a voz.
  monitorGain.gain.value = 0.92;
  recordGain.gain.value = 0.82;
  isolatedGain.gain.value = 1;

  source.connect(monitorGain).connect(context.destination);
  source.connect(recordGain).connect(master);
  source.connect(isolatedGain).connect(referenceDestination);

  // Evita áudio dobrado: o usuário passa a ouvir a referência pelo AudioContext, não pelo elemento nativo.
  reference.muted = true;
}

function connectReferenceFromCapturedStream(reference: HTMLVideoElement, context: AudioContext, master: GainNode, referenceDestination: MediaStreamAudioDestinationNode) {
  const referenceStream = capturedReferenceStream(reference);
  if (!referenceStream) return false;

  const source = context.createMediaStreamSource(referenceStream);
  const recordGain = context.createGain();
  const isolatedGain = context.createGain();

  recordGain.gain.value = 0.82;
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
  master.gain.value = 0.92;
  master.connect(destination);

  try {
    const microphone = context.createMediaStreamSource(stream);
    const micGain = context.createGain();
    micGain.gain.value = 0.88;
    microphone.connect(micGain).connect(master);
  } catch {}

  let referenceConnected = false;

  try {
    connectReferenceFromElement(reference, context, master, referenceDestination);
    referenceConnected = true;
  } catch {
    try {
      referenceConnected = connectReferenceFromCapturedStream(reference, context, master, referenceDestination);
    } catch {
      referenceConnected = false;
    }
  }

  // Se nenhum método de captura da referência estiver disponível, mantemos a gravação da voz funcionando
  // e deixamos o render final usar o áudio original da referência por URL.
  if (!referenceConnected) reference.muted = false;

  return {
    tracks: destination.stream.getAudioTracks(),
    referenceTracks: referenceDestination.stream.getAudioTracks(),
    context,
  };
}
