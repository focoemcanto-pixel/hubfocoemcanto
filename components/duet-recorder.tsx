'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Headphones, Mic, Music2, Pause, Play, RefreshCcw, Send, SlidersHorizontal, Sparkles, UploadCloud, Video } from 'lucide-react';

type Props = {
  lessonTitle: string;
  lessonSlug: string;
  referenceUrl?: string | null;
  referenceEmbedUrl?: string | null;
};

type Step = 'intro' | 'loading' | 'countdown' | 'recording' | 'review' | 'caption' | 'posted';

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function proxiedVideoUrl(url?: string | null) {
  if (!url) return '';
  if (url.startsWith('/api/media/drive/')) return url;
  if (url.startsWith('/api/drive/video/')) return url.replace('/api/drive/video/', '/api/media/drive/');
  const id = driveFileId(url);
  if (id) return `/api/media/drive/${id}`;
  return url;
}

function isSafariLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

function recorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const options = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
  return options.find((type) => MediaRecorder.isTypeSupported(type));
}

function videoOnlyMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const options = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'];
  return options.find((type) => MediaRecorder.isTypeSupported(type));
}

function audioOnlyMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return options.find((type) => MediaRecorder.isTypeSupported(type));
}

function recorderOptions(mimeType?: string, audioOnly = false): MediaRecorderOptions | undefined {
  const options: MediaRecorderOptions = {};
  if (mimeType) options.mimeType = mimeType;
  if (!audioOnly) options.videoBitsPerSecond = isSafariLike() ? 2500000 : 5000000;
  options.audioBitsPerSecond = audioOnly ? 160000 : 192000;
  return options;
}

function waitForVideoPlay(video: HTMLVideoElement | HTMLAudioElement) {
  return new Promise<void>((resolve) => {
    if (video.readyState >= 2) return resolve();
    const done = () => {
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('canplay', done);
      resolve();
    };
    video.addEventListener('loadedmetadata', done, { once: true });
    video.addEventListener('canplay', done, { once: true });
  });
}

function waitForVideoToMove(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const initial = video.currentTime;
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    const timeout = window.setTimeout(finish, isSafariLike() ? 900 : 650);
    const check = () => {
      if (resolved) return;
      if (video.readyState >= 2 && !video.paused && Math.abs(video.currentTime - initial) > 0.035) {
        window.clearTimeout(timeout);
        finish();
        return;
      }
      window.setTimeout(check, 30);
    };
    check();
  });
}

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [count, setCount] = useState(3);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [visualUrl, setVisualUrl] = useState<string | null>(null);
  const [micUrl, setMicUrl] = useState<string | null>(null);
  const [postCommunity, setPostCommunity] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAudioEditor, setShowAudioEditor] = useState(true);
  const [referenceVolume, setReferenceVolume] = useState(45);
  const [voiceVolume, setVoiceVolume] = useState(125);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const visualRecorderRef = useRef<MediaRecorder | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const visualChunksRef = useRef<Blob[]>([]);
  const micChunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const visualBlobRef = useRef<Blob | null>(null);
  const micBlobRef = useRef<Blob | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const referenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordedVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVisualRef = useRef<HTMLVideoElement | null>(null);
  const previewMicRef = useRef<HTMLAudioElement | null>(null);
  const previewReferenceRef = useRef<HTMLVideoElement | null>(null);
  const previewAudioContextRef = useRef<AudioContext | null>(null);
  const previewMicGainRef = useRef<GainNode | null>(null);
  const previewReferenceGainRef = useRef<GainNode | null>(null);
  const previewSourcesConnectedRef = useRef(false);
  const previewSyncRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawLoopRef = useRef<number | null>(null);
  const drawTimerRef = useRef<number | null>(null);

  const canRecord = useMemo(() => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, []);
  const referenceSource = proxiedVideoUrl(referenceUrl);

  useEffect(() => {
    const now = previewAudioContextRef.current?.currentTime || 0;
    if (previewReferenceGainRef.current) previewReferenceGainRef.current.gain.setTargetAtTime(referenceVolume / 100, now, 0.006);
    if (previewMicGainRef.current) previewMicGainRef.current.gain.setTargetAtTime(voiceVolume / 100, now, 0.006);
  }, [referenceVolume, voiceVolume]);

  function clearDrawLoop() {
    if (drawLoopRef.current) cancelAnimationFrame(drawLoopRef.current);
    if (drawTimerRef.current) window.clearInterval(drawTimerRef.current);
    drawLoopRef.current = null;
    drawTimerRef.current = null;
  }

  function stopPreviewSync() {
    if (previewSyncRef.current) cancelAnimationFrame(previewSyncRef.current);
    previewSyncRef.current = null;
  }

  function cleanupPreviewAudio() {
    stopPreviewSync();
    previewAudioContextRef.current?.close().catch(() => undefined);
    previewAudioContextRef.current = null;
    previewMicGainRef.current = null;
    previewReferenceGainRef.current = null;
    previewSourcesConnectedRef.current = false;
    setIsPreviewPlaying(false);
  }

  function waitForReferenceVideo() {
    return new Promise<void>((resolve, reject) => {
      const video = referenceVideoRef.current;
      if (!video || !referenceSource) return reject(new Error('missing_reference'));
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.preload = 'auto';
      video.muted = true;
      video.crossOrigin = 'anonymous';
      if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
      const timeout = window.setTimeout(() => cleanup(() => reject(new Error('timeout'))), 15000);
      const onReady = () => cleanup(resolve);
      const onError = () => cleanup(() => reject(new Error('load_error')));
      const cleanup = (done: () => void) => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        done();
      };
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
      video.load();
    });
  }

  async function prepareCameraStream() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720, max: 1280 }, height: { ideal: 720, max: 1280 }, frameRate: { ideal: 24, max: 30 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 },
    });
    cameraStreamRef.current = stream;
    const camera = cameraRef.current;
    if (camera) {
      camera.setAttribute('playsinline', 'true');
      camera.setAttribute('webkit-playsinline', 'true');
      camera.muted = true;
      camera.autoplay = true;
      camera.srcObject = stream;
      await waitForVideoPlay(camera);
      await camera.play().catch(() => undefined);
    }
    return stream;
  }

  async function startCountdown() {
    setError('');
    setRecordedUrl(null);
    setVisualUrl(null);
    setMicUrl(null);
    cleanupPreviewAudio();
    recordedBlobRef.current = null;
    visualBlobRef.current = null;
    micBlobRef.current = null;
    chunksRef.current = [];
    visualChunksRef.current = [];
    micChunksRef.current = [];
    if (!canRecord) return setError('Seu navegador não liberou gravação por câmera/microfone. Tente pelo Chrome ou Safari atualizado.');
    if (!referenceSource) return setError('Essa atividade ainda não tem vídeo de referência vinculado.');
    setStep('loading');
    try {
      await waitForReferenceVideo();
      const stream = await prepareCameraStream();
      drawDuetFrameOnce();
      setStep('countdown');
      let next = 3;
      setCount(next);
      const timer = window.setInterval(() => {
        next -= 1;
        if (next <= 0) {
          window.clearInterval(timer);
          beginDuetRecording(stream);
        } else setCount(next);
      }, 1000);
    } catch {
      setStep('intro');
      setError('O vídeo ou a câmera não carregaram. No iPhone, feche a aba, abra novamente e permita câmera/microfone.');
    }
  }

  function drawCover(ctx: CanvasRenderingContext2D, media: HTMLVideoElement, x: number, y: number, width: number, height: number) {
    const videoWidth = media.videoWidth || width;
    const videoHeight = media.videoHeight || height;
    const scale = Math.max(width / videoWidth, height / videoHeight);
    const sw = width / scale;
    const sh = height / scale;
    const sx = (videoWidth - sw) / 2;
    const sy = (videoHeight - sh) / 2;
    ctx.drawImage(media, sx, sy, sw, sh, x, y, width, height);
  }

  function drawDuetFrameOnce() {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const reference = referenceVideoRef.current;
    if (!canvas || !camera || !reference) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const half = width / 2;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);
    if (reference.readyState >= 2 && reference.videoWidth > 0) drawCover(ctx, reference, 0, 0, half, height);
    if (camera.readyState >= 2 && camera.videoWidth > 0) drawCover(ctx, camera, half, 0, half, height);
    ctx.fillStyle = 'rgba(0,0,0,.48)';
    ctx.fillRect(0, 0, width, 54);
    ctx.fillStyle = '#fff';
    ctx.font = '700 22px Arial';
    ctx.fillText('Referência', 24, 35);
    ctx.fillText('Aluno', half + 24, 35);
    ctx.strokeStyle = 'rgba(245,199,107,.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, height);
    ctx.stroke();
  }

  function startDrawLoop() {
    clearDrawLoop();
    const draw = () => { drawDuetFrameOnce(); drawLoopRef.current = requestAnimationFrame(draw); };
    if (isSafariLike()) {
      drawTimerRef.current = window.setInterval(drawDuetFrameOnce, 33);
      drawDuetFrameOnce();
      return;
    }
    draw();
  }

  function buildMixedAudioStream(reference: HTMLVideoElement, micStream: MediaStream) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return micStream.getAudioTracks();
    const audioContext = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();
    try {
      const micSource = audioContext.createMediaStreamSource(micStream);
      const micGain = audioContext.createGain();
      micGain.gain.value = voiceVolume / 100;
      micSource.connect(micGain).connect(destination);
    } catch {}
    try {
      const referenceSourceNode = audioContext.createMediaElementSource(reference);
      const referenceGain = audioContext.createGain();
      referenceGain.gain.value = referenceVolume / 100;
      referenceSourceNode.connect(referenceGain).connect(destination);
      referenceGain.connect(audioContext.destination);
    } catch {}
    return destination.stream.getAudioTracks();
  }

  function startSideRecorder(stream: MediaStream, chunks: Blob[], kind: 'video' | 'audio') {
    if (!stream.getTracks().length) return null;
    const type = kind === 'video' ? videoOnlyMimeType() : audioOnlyMimeType();
    try {
      const recorder = new MediaRecorder(stream, recorderOptions(type, kind === 'audio'));
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.start();
      return recorder;
    } catch {
      return null;
    }
  }

  async function beginDuetRecording(stream: MediaStream) {
    chunksRef.current = [];
    visualChunksRef.current = [];
    micChunksRef.current = [];
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const reference = referenceVideoRef.current;
    if (!canvas || !camera || !reference || reference.readyState < 2 || reference.videoWidth === 0) {
      setError('A referência ainda não está pronta. Tente iniciar novamente.');
      setStep('intro');
      return;
    }
    canvas.width = isSafariLike() ? 960 : 1280;
    canvas.height = isSafariLike() ? 540 : 720;
    try {
      await camera.play();
      reference.pause();
      reference.currentTime = 0;
      reference.muted = false;
      await reference.play();
      await waitForVideoToMove(reference);
      drawDuetFrameOnce();
    } catch {
      setError('O iPhone bloqueou o início do vídeo. Toque em “Iniciar dueto” novamente.');
      setStep('intro');
      return;
    }
    startDrawLoop();
    const canvasStream = canvas.captureStream(isSafariLike() ? 24 : 30);
    visualRecorderRef.current = startSideRecorder(new MediaStream(canvasStream.getVideoTracks()), visualChunksRef.current, 'video');
    micRecorderRef.current = startSideRecorder(new MediaStream(stream.getAudioTracks()), micChunksRef.current, 'audio');

    const mixedAudioTracks = buildMixedAudioStream(reference, stream);
    const mixedStream = new MediaStream([...canvasStream.getVideoTracks(), ...mixedAudioTracks]);
    const mimeType = recorderMimeType();
    const recorder = new MediaRecorder(mixedStream, recorderOptions(mimeType));
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      clearDrawLoop();
      reference.pause();
      audioContextRef.current?.close().catch(() => undefined);
      try { if (visualRecorderRef.current?.state === 'recording') visualRecorderRef.current.stop(); } catch {}
      try { if (micRecorderRef.current?.state === 'recording') micRecorderRef.current.stop(); } catch {}
      const type = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      recordedBlobRef.current = blob;
      setRecordedUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((track) => track.stop());
      window.setTimeout(() => {
        if (visualChunksRef.current.length) {
          visualBlobRef.current = new Blob(visualChunksRef.current, { type: visualRecorderRef.current?.mimeType || videoOnlyMimeType() || 'video/webm' });
          setVisualUrl(URL.createObjectURL(visualBlobRef.current));
        }
        if (micChunksRef.current.length) {
          micBlobRef.current = new Blob(micChunksRef.current, { type: micRecorderRef.current?.mimeType || audioOnlyMimeType() || 'audio/webm' });
          setMicUrl(URL.createObjectURL(micBlobRef.current));
        }
      }, 250);
      setShowAudioEditor(true);
      setStep('review');
    };
    reference.onended = () => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); };
    recorder.start();
    setStep('recording');
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function reset() {
    clearDrawLoop();
    cleanupPreviewAudio();
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close().catch(() => undefined);
    setRecordedUrl(null);
    setVisualUrl(null);
    setMicUrl(null);
    recordedBlobRef.current = null;
    visualBlobRef.current = null;
    micBlobRef.current = null;
    setCaption('');
    setPostCommunity(false);
    setStep('intro');
  }

  async function setupReviewMixer() {
    const visual = previewVisualRef.current;
    const mic = previewMicRef.current;
    const reference = previewReferenceRef.current;
    if (!visual || !mic || !reference || !visualUrl || !micUrl || !referenceSource) return false;
    if (previewSourcesConnectedRef.current) return true;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;
    const audioContext = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
    previewAudioContextRef.current = audioContext;
    const micGain = audioContext.createGain();
    const referenceGain = audioContext.createGain();
    micGain.gain.value = voiceVolume / 100;
    referenceGain.gain.value = referenceVolume / 100;
    previewMicGainRef.current = micGain;
    previewReferenceGainRef.current = referenceGain;
    try {
      mic.muted = false;
      reference.muted = false;
      mic.volume = 1;
      reference.volume = 1;
      const micSource = audioContext.createMediaElementSource(mic);
      const referenceSourceNode = audioContext.createMediaElementSource(reference);
      micSource.connect(micGain).connect(audioContext.destination);
      referenceSourceNode.connect(referenceGain).connect(audioContext.destination);
      previewSourcesConnectedRef.current = true;
      return true;
    } catch {
      return false;
    }
  }

  function startPreviewSyncLoop() {
    stopPreviewSync();
    const tick = () => {
      syncPreviewTime();
      previewSyncRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function togglePreviewPlayback() {
    const visual = previewVisualRef.current || recordedVideoRef.current;
    const mic = previewMicRef.current;
    const reference = previewReferenceRef.current;
    if (!visual) return;

    if (isPreviewPlaying) {
      visual.pause();
      mic?.pause();
      reference?.pause();
      stopPreviewSync();
      setIsPreviewPlaying(false);
      return;
    }

    if (visualUrl && micUrl && referenceSource) {
      await setupReviewMixer();
      const time = visual.currentTime || 0;
      if (mic) mic.currentTime = time;
      if (reference) reference.currentTime = time;
      await previewAudioContextRef.current?.resume().catch(() => undefined);
      await Promise.all([visual.play(), mic?.play().catch(() => undefined), reference?.play().catch(() => undefined)]).catch(() => undefined);
      startPreviewSyncLoop();
    } else {
      await visual.play().catch(() => undefined);
    }
    setIsPreviewPlaying(true);
  }

  function syncPreviewTime() {
    const visual = previewVisualRef.current || recordedVideoRef.current;
    const mic = previewMicRef.current;
    const reference = previewReferenceRef.current;
    if (!visual) return;
    const duration = visual.duration || 0;
    setPreviewProgress(duration ? (visual.currentTime / duration) * 100 : 0);
    if (mic && Math.abs(mic.currentTime - visual.currentTime) > 0.08) mic.currentTime = visual.currentTime;
    if (reference && Math.abs(reference.currentTime - visual.currentTime) > 0.08) reference.currentTime = visual.currentTime;
  }

  async function renderFinalDuetBlob() {
    const visualBlob = visualBlobRef.current;
    const micBlob = micBlobRef.current;
    if (!visualBlob || !micBlob || !referenceSource) return recordedBlobRef.current;
    setError('');
    const visual = document.createElement('video');
    const mic = document.createElement('audio');
    const reference = document.createElement('video');
    visual.src = URL.createObjectURL(visualBlob);
    mic.src = URL.createObjectURL(micBlob);
    reference.src = referenceSource;
    reference.crossOrigin = 'anonymous';
    visual.muted = true;
    mic.muted = false;
    reference.muted = false;
    mic.volume = 1;
    reference.volume = 1;
    visual.playsInline = true;
    reference.playsInline = true;
    await Promise.all([waitForVideoPlay(visual), waitForVideoPlay(mic), waitForVideoPlay(reference)]);

    const canvas = document.createElement('canvas');
    canvas.width = isSafariLike() ? 960 : 1280;
    canvas.height = isSafariLike() ? 540 : 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_failed');
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('audio_context_failed');
    const audioContext = new AudioCtx({ latencyHint: 'playback', sampleRate: 48000 });
    const destination = audioContext.createMediaStreamDestination();
    const referenceSourceNode = audioContext.createMediaElementSource(reference);
    const referenceGain = audioContext.createGain();
    referenceGain.gain.value = referenceVolume / 100;
    referenceSourceNode.connect(referenceGain).connect(destination);
    const micSourceNode = audioContext.createMediaElementSource(mic);
    const micGain = audioContext.createGain();
    micGain.gain.value = voiceVolume / 100;
    micSourceNode.connect(micGain).connect(destination);

    const outputStream = new MediaStream([...canvas.captureStream(isSafariLike() ? 24 : 30).getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const mimeType = recorderMimeType();
    const recorder = new MediaRecorder(outputStream, recorderOptions(mimeType));
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
    });
    let frame = 0;
    const draw = () => {
      if (visual.ended || visual.paused) return;
      ctx.drawImage(visual, 0, 0, canvas.width, canvas.height);
      frame = requestAnimationFrame(draw);
    };
    recorder.start();
    visual.currentTime = 0;
    reference.currentTime = 0;
    mic.currentTime = 0;
    await audioContext.resume().catch(() => undefined);
    await Promise.all([visual.play(), reference.play(), mic.play()]);
    draw();
    visual.onended = () => { cancelAnimationFrame(frame); if (recorder.state === 'recording') recorder.stop(); };
    window.setTimeout(() => { cancelAnimationFrame(frame); if (recorder.state === 'recording') recorder.stop(); }, Math.max(2500, (visual.duration || 90) * 1000 + 800));
    const remixed = await done;
    await audioContext.close().catch(() => undefined);
    return remixed;
  }

  async function submitDuet(finalCaption: string, forceCommunity = postCommunity) {
    if (!recordedBlobRef.current) return setError('Grave o dueto antes de enviar.');
    setIsSubmitting(true);
    setError('');
    try {
      const finalBlob = (await renderFinalDuetBlob()) || recordedBlobRef.current;
      recordedBlobRef.current = finalBlob;
      const data = new FormData();
      const fileType = finalBlob.type || 'video/webm';
      const extension = fileType.includes('mp4') ? 'mp4' : 'webm';
      data.set('lesson_slug', lessonSlug);
      data.set('caption', finalCaption);
      data.set('visibility', forceCommunity ? 'community' : 'private');
      data.set('file', new File([finalBlob], `${lessonSlug}-dueto.${extension}`, { type: fileType }));
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        setError(json?.detail || json?.message || 'Não consegui enviar sua atividade.');
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      setStep('posted');
    } catch {
      setIsSubmitting(false);
      setError('Não consegui renderizar o dueto final com esse equilíbrio de áudio neste navegador.');
    }
  }

  function publishReview() {
    if (postCommunity) { setStep('caption'); return; }
    submitDuet('', false);
  }

  function finishPost() {
    submitDuet(caption || 'Minha prática do dueto.', true);
  }

  return (
    <div className="duet-remix-studio real-duet-studio premium-duet-studio reels-duet-editor">
      <section className="duet-remix-header premium-duet-header reels-duet-topbar">
        <div>
          <p className="eyebrow">Atividade prática</p>
          <h1>Grave seu dueto</h1>
          <p className="muted">Aula: {lessonTitle}</p>
          <div className="premium-duet-steps"><span><Video size={16} /> Assista</span><span><Mic size={16} /> Grave</span><span><Send size={16} /> Envie</span></div>
        </div>
        <div className="duet-instruction compact premium-duet-instruction"><Headphones size={24} /><div><strong>Use fone de ouvido</strong><p>O vídeo da atividade e sua câmera entram no mesmo quadro. No final, o arquivo gerado já sai como dueto com os dois áudios.</p></div></div>
      </section>

      {error ? <p className="duet-error premium-duet-error">{error}</p> : null}

      <section className="real-duet-stage premium-duet-stage reels-duet-preview">
        <video ref={referenceVideoRef} className="ios-duet-source" src={referenceSource} crossOrigin="anonymous" playsInline muted preload="auto" />
        <video ref={cameraRef} className="ios-duet-source" autoPlay muted playsInline />
        {step === 'review' && visualUrl ? (
          <>
            <video ref={previewVisualRef} className="duet-final-video realtime-duet-video" src={visualUrl} playsInline muted onTimeUpdate={syncPreviewTime} onEnded={() => { stopPreviewSync(); setIsPreviewPlaying(false); }} />
            <audio ref={previewMicRef} src={micUrl || undefined} preload="auto" />
            <video ref={previewReferenceRef} src={referenceSource} crossOrigin="anonymous" playsInline preload="auto" className="ios-duet-source" />
            <button type="button" className="reels-preview-play" onClick={togglePreviewPlayback}>{isPreviewPlaying ? <Pause size={34} fill="currentColor" /> : <Play size={38} fill="currentColor" />}</button>
          </>
        ) : recordedUrl ? (
          <video ref={recordedVideoRef} className="duet-final-video" src={recordedUrl} controls playsInline onTimeUpdate={syncPreviewTime} />
        ) : <canvas ref={canvasRef} className="duet-canvas" width={1280} height={720} />}
        {step === 'intro' ? <div className="duet-stage-overlay premium-duet-overlay"><div className="premium-duet-start-card"><span><Sparkles size={20} /> Pronto para praticar?</span><h2>Grave sua segunda voz junto com a referência.</h2><p>Prepare o fone, posicione a câmera e clique para iniciar a contagem.</p><button className="button premium-primary-button" onClick={startCountdown}><Mic size={18} /> Iniciar dueto</button></div></div> : null}
        {step === 'loading' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">Preparando vídeo e câmera...</span></div> : null}
        {step === 'countdown' ? <div className="countdown overlay-countdown">{count}</div> : null}
        {step === 'review' ? <div className="reels-video-chip"><Music2 size={17} /> {lessonTitle}</div> : null}
      </section>

      {step === 'review' ? <section className="reels-preview-timeline"><button type="button" onClick={togglePreviewPlayback}>{isPreviewPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}</button><div><span style={{ width: `${previewProgress}%` }} /></div></section> : null}

      <section className="premium-audio-editor-toggle reels-audio-toggle compact-mixer-toggle">
        <button type="button" onClick={() => setShowAudioEditor((value) => !value)}><SlidersHorizontal size={18} /> Mixer</button>
        <span>Voz {voiceVolume}% · Ref {referenceVolume}%</span>
      </section>

      {showAudioEditor ? (
        <section className="premium-audio-editor reels-live-mixer compact-live-mixer">
          <div className="reels-mixer-row"><span className="mixer-icon mic"><Mic size={18} /></span><label>Voz</label><input type="range" min="0" max="200" value={voiceVolume} onChange={(event) => setVoiceVolume(Number(event.target.value))} /><strong>{voiceVolume}%</strong></div>
          <div className="reels-mixer-row"><span className="mixer-icon ref"><Music2 size={18} /></span><label>Referência</label><input type="range" min="0" max="120" value={referenceVolume} onChange={(event) => setReferenceVolume(Number(event.target.value))} /><strong>{referenceVolume}%</strong></div>
          <p><Headphones size={15} /> Ajuste enquanto a prévia toca. A mudança é imediata.</p>
        </section>
      ) : null}

      <section className="duet-control-bar premium-duet-control-bar reels-review-actions">
        {step === 'recording' ? <><span className="recording-dot">● Gravando dueto real</span><button className="button danger" onClick={stopRecording}>Finalizar gravação</button></> : null}
        {step === 'review' ? <><button className="button secondary" onClick={reset}><RefreshCcw size={16} /> Regravar</button><label className="community-toggle review-community-toggle"><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Publicar também na comunidade</label><button className="button" onClick={publishReview} disabled={isSubmitting}><UploadCloud size={16} /> {isSubmitting ? 'Renderizando...' : 'Enviar para avaliação'}</button></> : null}
      </section>

      {step === 'review' ? <section className="duet-review-note premium-duet-note"><CheckCircle2 size={24} /><div><h2>Dueto gerado</h2><p>Confira o vídeo, ajuste o equilíbrio em tempo real e envie. Marcando a comunidade, você escreve uma legenda antes de publicar.</p></div></section> : null}
      {step === 'caption' ? <section className="caption-box duet-caption-box premium-duet-note reels-publish-card"><div><h2>Legenda da comunidade</h2><p>Compartilhe sua prática no feed.</p><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda para o feed..." /></div><button className="button" onClick={finishPost} disabled={isSubmitting}>{isSubmitting ? 'Renderizando...' : 'Publicar no feed e enviar'}</button></section> : null}
      {step === 'posted' ? <section className="posted-box duet-posted-box premium-duet-note"><CheckCircle2 size={28} /><div><h2>Atividade enviada</h2><p>Sua gravação entrou na fila de avaliação do professor.</p><a className="button secondary" href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
    </div>
  );
}
