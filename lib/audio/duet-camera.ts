export type DuetMicMode = 'studio' | 'clean';
export type DuetFacingMode = 'user' | 'environment';

type PrepareDuetCameraOptions = {
  audioDeviceId?: string | null;
  micMode?: DuetMicMode;
  facingMode?: DuetFacingMode;
};

function isIOSLike() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function centerMicAudio(stream: MediaStream) {
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) return stream;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return stream;

  const ctx = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
  const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
  const splitter = ctx.createChannelSplitter(2);
  const mono = ctx.createGain();
  const destination = ctx.createMediaStreamDestination();

  mono.gain.value = 0.9;
  source.connect(splitter);
  splitter.connect(mono, 0);
  try { splitter.connect(mono, 1); } catch {}
  mono.connect(destination);

  return new MediaStream([...stream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
}

export async function prepareDuetCamera(camera: HTMLVideoElement | null, options: PrepareDuetCameraOptions = {}) {
  const isCleanMode = options.micMode === 'clean';
  const ios = isIOSLike();
  const audio: MediaTrackConstraints = {
    echoCancellation: isCleanMode,
    noiseSuppression: isCleanMode,
    autoGainControl: isCleanMode,
    sampleRate: 48000,
    channelCount: 1,
  };

  if (options.audioDeviceId) audio.deviceId = { exact: options.audioDeviceId };

  const rawStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: ios ? { ideal: 540, max: 720 } : { ideal: 720, max: 1280 },
      height: ios ? { ideal: 540, max: 720 } : { ideal: 720, max: 1280 },
      frameRate: ios ? { ideal: 24, max: 24 } : { ideal: 24, max: 30 },
    },
    audio,
  });
  const stream = centerMicAudio(rawStream);

  if (camera) {
    camera.muted = true;
    camera.playsInline = true;
    camera.srcObject = stream;
    await new Promise<void>((resolve) => {
      if (camera.readyState >= 2) return resolve();
      camera.addEventListener('canplay', () => resolve(), { once: true });
      camera.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
    await camera.play().catch(() => undefined);
  }

  return stream;
}
