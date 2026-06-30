import type { DuetV2PrepareOptions, DuetV2RecordingResult, DuetV2Session } from './types';
import { createDuetV2Recorder } from './recorders';
import { isSafariLikeV2, stopTracks, waitForMediaReadyV2 } from './utils';

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function makeAudioContextV2() {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
}

function captureReferenceStream(reference: HTMLVideoElement) {
  const capturable = reference as CapturableVideo;
  const capture = capturable.captureStream || capturable.mozCaptureStream;
  if (!capture) return null;
  try {
    const stream = capture.call(reference);
    return stream.getAudioTracks().length ? stream : null;
  } catch {
    return null;
  }
}

function drawCover(ctx: CanvasRenderingContext2D, media: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  const vw = media.videoWidth || width;
  const vh = media.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const sw = width / scale;
  const sh = height / scale;
  ctx.drawImage(media, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, width, height);
}

function drawSelfie(ctx: CanvasRenderingContext2D, camera: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.translate(x + width, y);
  ctx.scale(-1, 1);
  drawCover(ctx, camera, 0, 0, width, height);
  ctx.restore();
}

function startCanvasDraw(args: {
  canvas: HTMLCanvasElement;
  camera: HTMLVideoElement;
  reference: HTMLVideoElement;
  frameRate: number;
}) {
  const ctx = args.canvas.getContext('2d');
  if (!ctx) return () => undefined;

  let frame = 0;
  let timer: number | null = null;
  const draw = () => {
    const width = args.canvas.width;
    const height = args.canvas.height;
    const half = width / 2;
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, width, height);
    if (args.reference.readyState >= 2 && args.reference.videoWidth > 0) drawCover(ctx, args.reference, 0, 0, half, height);
    if (args.camera.readyState >= 2 && args.camera.videoWidth > 0) drawSelfie(ctx, args.camera, half, 0, half, height);
  };

  if (isSafariLikeV2()) {
    timer = window.setInterval(draw, Math.max(30, Math.round(1000 / args.frameRate)));
    draw();
    return () => { if (timer) window.clearInterval(timer); };
  }

  let last = 0;
  const interval = 1000 / args.frameRate;
  const loop = (now = 0) => {
    if (now - last >= interval) {
      draw();
      last = now;
    }
    frame = requestAnimationFrame(loop);
  };
  loop();
  return () => cancelAnimationFrame(frame);
}

async function openCameraAndMic(audioDeviceId?: string | null) {
  const audio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    sampleRate: 48000,
  };
  if (audioDeviceId) audio.deviceId = { exact: audioDeviceId };

  return await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio,
  });
}

function buildMixedAudio(args: { micStream: MediaStream; referenceStream: MediaStream | null }) {
  const context = makeAudioContextV2();
  if (!context) return { context: null, mixedStream: null };

  const destination = context.createMediaStreamDestination();
  try {
    const mic = context.createMediaStreamSource(args.micStream);
    const micGain = context.createGain();
    micGain.gain.value = 1;
    mic.connect(micGain).connect(destination);
  } catch {}

  if (args.referenceStream?.getAudioTracks().length) {
    try {
      const reference = context.createMediaStreamSource(args.referenceStream);
      const referenceGain = context.createGain();
      referenceGain.gain.value = 1;
      reference.connect(referenceGain).connect(destination);
    } catch {}
  }

  context.resume().catch(() => undefined);
  return { context, mixedStream: destination.stream };
}

export async function startDuetV2Session(options: DuetV2PrepareOptions, refs: {
  camera: HTMLVideoElement | null;
  reference: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
}): Promise<DuetV2Session> {
  const camera = refs.camera;
  const reference = refs.reference;
  const canvas = refs.canvas;
  if (!camera || !reference || !canvas) throw new Error('missing_duet_v2_refs');
  if (!options.referenceUrl) throw new Error('missing_reference_url');

  const width = options.width || 1280;
  const height = options.height || 720;
  const frameRate = options.frameRate || (isSafariLikeV2() ? 24 : 30);
  canvas.width = width;
  canvas.height = height;

  reference.crossOrigin = 'anonymous';
  reference.src = options.referenceUrl;
  reference.preload = 'auto';
  reference.playsInline = true;
  reference.muted = false;
  reference.load();
  await waitForMediaReadyV2(reference);

  const cameraStream = await openCameraAndMic(options.audioDeviceId);
  camera.srcObject = cameraStream;
  camera.muted = true;
  camera.playsInline = true;
  await waitForMediaReadyV2(camera, 12000).catch(() => undefined);
  await camera.play().catch(() => undefined);

  const microphoneStream = new MediaStream(cameraStream.getAudioTracks());
  reference.currentTime = 0;
  await reference.play();
  const referenceStream = captureReferenceStream(reference);
  const stopDraw = startCanvasDraw({ canvas, camera, reference, frameRate });
  const canvasStream = canvas.captureStream(frameRate);
  const { context, mixedStream } = buildMixedAudio({ micStream: microphoneStream, referenceStream });

  const cameraRecorder = createDuetV2Recorder('camera', new MediaStream(cameraStream.getVideoTracks()));
  const canvasRecorder = createDuetV2Recorder('canvas', new MediaStream(canvasStream.getVideoTracks()));
  const voiceRecorder = createDuetV2Recorder('voice', microphoneStream);
  const referenceRecorder = referenceStream ? createDuetV2Recorder('reference', new MediaStream(referenceStream.getAudioTracks())) : null;
  const mixedRecorder = mixedStream ? createDuetV2Recorder('mixed', new MediaStream([...canvasStream.getVideoTracks(), ...mixedStream.getAudioTracks()])) : null;

  const startedAt = Date.now();
  [cameraRecorder, canvasRecorder, voiceRecorder, referenceRecorder, mixedRecorder].forEach((handle) => handle?.start());

  const stop = async (): Promise<DuetV2RecordingResult> => {
    const stoppedAt = Date.now();
    reference.pause();
    stopDraw();

    const [cameraBlob, canvasBlob, voiceBlob, referenceBlob, mixedBlob] = await Promise.all([
      cameraRecorder?.stop() ?? Promise.resolve(null),
      canvasRecorder?.stop() ?? Promise.resolve(null),
      voiceRecorder?.stop() ?? Promise.resolve(null),
      referenceRecorder?.stop() ?? Promise.resolve(null),
      mixedRecorder?.stop() ?? Promise.resolve(null),
    ]);

    stopTracks(cameraStream);
    stopTracks(canvasStream);
    stopTracks(referenceStream);
    stopTracks(mixedStream);
    await context?.close().catch(() => undefined);

    return {
      cameraBlob,
      canvasBlob,
      voiceBlob,
      referenceBlob,
      mixedBlob,
      startedAt,
      stoppedAt,
      durationMs: Math.max(0, stoppedAt - startedAt),
      mimeTypes: {
        camera: cameraRecorder?.mimeType,
        canvas: canvasRecorder?.mimeType,
        voice: voiceRecorder?.mimeType,
        reference: referenceRecorder?.mimeType,
        mixed: mixedRecorder?.mimeType,
      },
      diagnostics: {
        cameraChunks: cameraRecorder?.chunks.length || 0,
        canvasChunks: canvasRecorder?.chunks.length || 0,
        voiceChunks: voiceRecorder?.chunks.length || 0,
        referenceChunks: referenceRecorder?.chunks.length || 0,
        mixedChunks: mixedRecorder?.chunks.length || 0,
        hasReferenceTrack: Boolean(referenceStream?.getAudioTracks().length),
        hasMicrophoneTrack: microphoneStream.getAudioTracks().length > 0,
        hasCanvasVideoTrack: canvasStream.getVideoTracks().length > 0,
      },
    };
  };

  return {
    refs,
    referenceUrl: options.referenceUrl,
    cameraStream,
    canvasStream,
    microphoneStream,
    referenceStream,
    mixedStream,
    audioContext: context,
    startedAt,
    stop,
  };
}
