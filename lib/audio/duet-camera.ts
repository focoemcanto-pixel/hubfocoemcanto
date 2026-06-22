type PrepareDuetCameraOptions = {
  audioDeviceId?: string | null;
};

export async function prepareDuetCamera(camera: HTMLVideoElement | null, options: PrepareDuetCameraOptions = {}) {
  const audio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000,
    channelCount: 1,
  };

  if (options.audioDeviceId) {
    audio.deviceId = { exact: options.audioDeviceId };
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 720, max: 1280 },
      height: { ideal: 720, max: 1280 },
      frameRate: { ideal: 24, max: 30 },
    },
    audio,
  });

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
