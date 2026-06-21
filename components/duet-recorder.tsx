'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Headphones, Mic, Music2, Play, RefreshCcw, Send, SlidersHorizontal, Sparkles, UploadCloud, Video, Wand2 } from 'lucide-react';

type Props = {
  lessonTitle: string;
  lessonSlug: string;
  referenceUrl?: string | null;
  referenceEmbedUrl?: string | null;
};

type Step = 'intro' | 'loading' | 'countdown' | 'recording' | 'review' | 'rendering' | 'caption' | 'posted';
type VoicePreset = 'natural' | 'studio' | 'worship' | 'coral';

const presets: Array<{ id: VoicePreset; label: string; description: string }> = [
  { id: 'natural', label: 'Natural', description: 'Voz limpa e sem exagero.' },
  { id: 'studio', label: 'Studio', description: 'Compressão e brilho de gravação.' },
  { id: 'worship', label: 'Worship', description: 'Reverb bonito para louvor.' },
  { id: 'coral', label: 'Coral', description: 'Leve ambiência para segunda voz.' },
];

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

function recorderMimeType(videoOnly = false, audioOnly = false) {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const options = audioOnly
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    : videoOnly
      ? ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4']
      : ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
  return options.find((type) => MediaRecorder.isTypeSupported(type));
}

function recorderOptions(mimeType?: string, audioOnly = false): MediaRecorderOptions {
  const options: MediaRecorderOptions = {};
  if (mimeType) options.mimeType = mimeType;
  if (!audioOnly) options.videoBitsPerSecond = isSafariLike() ? 2500000 : 5200000;
  options.audioBitsPerSecond = audioOnly ? 160000 : 192000;
  return options;
}

function waitForMediaReady(media: HTMLMediaElement) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    const timeout = window.setTimeout(() => cleanup(() => reject(new Error('media_timeout'))), 18000);
    const done = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('media_error')));
    const cleanup = (callback: () => void) => {
      window.clearTimeout(timeout);
      media.removeEventListener('loadedmetadata', done);
      media.removeEventListener('canplay', done);
      media.removeEventListener('error', fail);
      callback();
    };
    media.addEventListener('loadedmetadata', done, { once: true });
    media.addEventListener('canplay', done, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
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

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [count, setCount] = useState(3);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  const [postCommunity, setPostCommunity] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referenceVolume, setReferenceVolume] = useState(45);
  const [voiceVolume, setVoiceVolume] = useState(125);
  const [preset, setPreset] = useState<VoicePreset>('worship');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const visualRecorderRef = useRef<MediaRecorder | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const visualChunksRef = useRef<Blob[]>([]);
  const micChunksRef = useRef<Blob[]>([]);
  const previewBlobRef = useRef<Blob | null>(null);
  const rawPreviewBlobRef = useRef<Blob | null>(null);
  const visualBlobRef = useRef<Blob | null>(null);
  const micBlobRef = useRef<Blob | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const referenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawLoopRef = useRef<number | null>(null);
  const drawTimerRef = useRef<number | null>(null);

  const canRecord = useMemo(() => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, []);
  const referenceSource = proxiedVideoUrl(referenceUrl);

  function clearDrawLoop() {
    if (drawLoopRef.current) cancelAnimationFrame(drawLoopRef.current);
    if (drawTimerRef.current) window.clearInterval(drawTimerRef.current);
    drawLoopRef.current = null;
    drawTimerRef.current = null;
  }

  function resetRecorders() {
    clearDrawLoop();
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close().catch(() => undefined);
    mediaRecorderRef.current = null;
    visualRecorderRef.current = null;
    micRecorderRef.current = null;
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
    ctx.fillStyle = 'rgba(0,0,0,.46)';
    ctx.fillRect(0, 0, width, 54);
    ctx.fillStyle = '#fff';
    ctx.font = '700 22px Arial';
    ctx.fillText('Referência', 24, 35);
    ctx.fillText('Você', half + 24, 35);
    ctx.strokeStyle = 'rgba(245,199,107,.58)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, height);
    ctx.stroke();
  }

  function startDrawLoop() {
    clearDrawLoop();
    const draw = () => {
      drawDuetFrameOnce();
      drawLoopRef.current = requestAnimationFrame(draw);
    };
    if (isSafariLike()) {
      drawTimerRef.current = window.setInterval(drawDuetFrameOnce, 33);
      drawDuetFrameOnce();
      return;
    }
    draw();
  }

  async function prepareCameraStream() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720, max: 1280 }, height: { ideal: 720, max: 1280 }, frameRate: { ideal: 24, max: 30 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 },
    });
    cameraStreamRef.current = stream;
    const camera = cameraRef.current;
    if (camera) {
      camera.muted = true;
      camera.autoplay = true;
      camera.playsInline = true;
      camera.srcObject = stream;
      await waitForMediaReady(camera);
      await camera.play().catch(() => undefined);
    }
    return stream;
  }

  function buildRecordingAudio(reference: HTMLVideoElement, micStream: MediaStream) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return micStream.getAudioTracks();
    const audioContext = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();
    try {
      const micSource = audioContext.createMediaStreamSource(micStream);
      const micGain = audioContext.createGain();
      micGain.gain.value = 1;
      micSource.connect(micGain).connect(destination);
    } catch {}
    try {
      const referenceSourceNode = audioContext.createMediaElementSource(reference);
      const referenceGain = audioContext.createGain();
      referenceGain.gain.value = 0.45;
      referenceSourceNode.connect(referenceGain).connect(destination);
      referenceGain.connect(audioContext.destination);
    } catch {}
    return destination.stream.getAudioTracks();
  }

  function startSideRecorder(stream: MediaStream, chunks: Blob[], kind: 'video' | 'audio') {
    if (!stream.getTracks().length) return null;
    const type = kind === 'video' ? recorderMimeType(true, false) : recorderMimeType(false, true);
    try {
      const recorder = new MediaRecorder(stream, recorderOptions(type, kind === 'audio'));
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.start(1000);
      return recorder;
    } catch {
      return null;
    }
  }

  async function startCountdown() {
    setError('');
    setPreviewUrl(null);
    setRawPreviewUrl(null);
    previewBlobRef.current = null;
    rawPreviewBlobRef.current = null;
    visualBlobRef.current = null;
    micBlobRef.current = null;
    chunksRef.current = [];
    visualChunksRef.current = [];
    micChunksRef.current = [];
    resetRecorders();
    if (!canRecord) return setError('Seu navegador não liberou câmera/microfone. Tente pelo Chrome ou Safari atualizado.');
    if (!referenceSource) return setError('Essa atividade ainda não tem vídeo de referência vinculado.');
    setStep('loading');
    try {
      const reference = referenceVideoRef.current;
      if (!reference) throw new Error('missing_reference');
      reference.crossOrigin = 'anonymous';
      reference.muted = true;
      reference.playsInline = true;
      reference.preload = 'auto';
      reference.load();
      await waitForMediaReady(reference);
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
      setError('O vídeo ou a câmera não carregaram. Feche a aba, abra novamente e permita câmera/microfone.');
    }
  }

  async function beginDuetRecording(stream: MediaStream) {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const reference = referenceVideoRef.current;
    if (!canvas || !camera || !reference) return;
    chunksRef.current = [];
    visualChunksRef.current = [];
    micChunksRef.current = [];
    canvas.width = isSafariLike() ? 960 : 1280;
    canvas.height = isSafariLike() ? 540 : 720;
    try {
      await camera.play();
      reference.pause();
      reference.currentTime = 0;
      reference.muted = false;
      await reference.play();
      startDrawLoop();
    } catch {
      setStep('intro');
      setError('O navegador bloqueou o início do dueto. Toque novamente em “Iniciar dueto”.');
      return;
    }

    const canvasStream = canvas.captureStream(isSafariLike() ? 24 : 30);
    visualRecorderRef.current = startSideRecorder(new MediaStream(canvasStream.getVideoTracks()), visualChunksRef.current, 'video');
    micRecorderRef.current = startSideRecorder(new MediaStream(stream.getAudioTracks()), micChunksRef.current, 'audio');

    const mixedAudioTracks = buildRecordingAudio(reference, stream);
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
      const rawType = recorder.mimeType || mimeType || 'video/webm';
      const rawBlob = new Blob(chunksRef.current, { type: rawType });
      rawPreviewBlobRef.current = rawBlob;
      previewBlobRef.current = rawBlob;
      setRawPreviewUrl(URL.createObjectURL(rawBlob));
      setPreviewUrl(URL.createObjectURL(rawBlob));
      stream.getTracks().forEach((track) => track.stop());
      window.setTimeout(() => {
        if (visualChunksRef.current.length && micChunksRef.current.length) {
          visualBlobRef.current = new Blob(visualChunksRef.current, { type: visualRecorderRef.current?.mimeType || recorderMimeType(true, false) || 'video/webm' });
          micBlobRef.current = new Blob(micChunksRef.current, { type: micRecorderRef.current?.mimeType || recorderMimeType(false, true) || 'audio/webm' });
        }
      }, 900);
      setStep('review');
    };
    reference.onended = () => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); };
    recorder.start(1000);
    setStep('recording');
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function reset() {
    resetRecorders();
    setPreviewUrl(null);
    setRawPreviewUrl(null);
    previewBlobRef.current = null;
    rawPreviewBlobRef.current = null;
    visualBlobRef.current = null;
    micBlobRef.current = null;
    setCaption('');
    setPostCommunity(false);
    setStep('intro');
  }

  function connectPresetChain(ctx: AudioContext, input: AudioNode, output: AudioNode, selected: VoicePreset) {
    const gain = ctx.createGain();
    gain.gain.value = voiceVolume / 100;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = selected === 'natural' ? 70 : 95;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3200;
    presence.Q.value = 0.9;
    presence.gain.value = selected === 'natural' ? 1.5 : selected === 'coral' ? 2.2 : 3.2;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = selected === 'natural' ? -20 : -26;
    compressor.knee.value = 18;
    compressor.ratio.value = selected === 'natural' ? 2.4 : 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 2;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    input.connect(gain).connect(highpass).connect(presence).connect(compressor);
    if (selected === 'worship' || selected === 'coral') {
      const delay = ctx.createDelay(0.35);
      delay.delayTime.value = selected === 'coral' ? 0.028 : 0.12;
      const wet = ctx.createGain();
      wet.gain.value = selected === 'coral' ? 0.18 : 0.14;
      const dry = ctx.createGain();
      dry.gain.value = 0.92;
      compressor.connect(dry).connect(limiter);
      compressor.connect(delay).connect(wet).connect(limiter);
    } else {
      compressor.connect(limiter);
    }
    limiter.connect(output);
  }

  async function renderSmulePreview() {
    const visualBlob = visualBlobRef.current;
    const micBlob = micBlobRef.current;
    if (!visualBlob || !micBlob || !referenceSource) {
      setError('As faixas separadas ainda estão preparando. Aguarde um instante e tente novamente.');
      return null;
    }
    setStep('rendering');
    setError('');
    try {
      const visual = document.createElement('video');
      const mic = document.createElement('audio');
      const reference = document.createElement('video');
      visual.src = URL.createObjectURL(visualBlob);
      mic.src = URL.createObjectURL(micBlob);
      reference.src = referenceSource;
      reference.crossOrigin = 'anonymous';
      visual.muted = true;
      mic.volume = 1;
      reference.volume = 1;
      visual.playsInline = true;
      reference.playsInline = true;
      await Promise.all([waitForMediaReady(visual), waitForMediaReady(mic), waitForMediaReady(reference)]);

      const canvas = document.createElement('canvas');
      canvas.width = isSafariLike() ? 960 : 1280;
      canvas.height = isSafariLike() ? 540 : 720;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) throw new Error('canvas_failed');
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) throw new Error('audio_context_failed');
      const audioCtx = new AudioCtx({ latencyHint: 'playback', sampleRate: 48000 });
      const destination = audioCtx.createMediaStreamDestination();

      const referenceSourceNode = audioCtx.createMediaElementSource(reference);
      const referenceGain = audioCtx.createGain();
      referenceGain.gain.value = referenceVolume / 100;
      referenceSourceNode.connect(referenceGain).connect(destination);

      const micSource = audioCtx.createMediaElementSource(mic);
      connectPresetChain(audioCtx, micSource, destination, preset);

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
        if (visual.paused || visual.ended) return;
        ctx2d.drawImage(visual, 0, 0, canvas.width, canvas.height);
        frame = requestAnimationFrame(draw);
      };
      const stop = () => {
        mic.pause();
        reference.pause();
        cancelAnimationFrame(frame);
        if (recorder.state === 'recording') recorder.stop();
      };
      recorder.start(1000);
      visual.currentTime = 0;
      mic.currentTime = 0;
      reference.currentTime = 0;
      await audioCtx.resume().catch(() => undefined);
      await Promise.all([visual.play(), mic.play(), reference.play()]);
      draw();
      visual.onended = stop;
      window.setTimeout(stop, Math.max(2500, (visual.duration || 90) * 1000 + 900));
      const finalBlob = await done;
      await audioCtx.close().catch(() => undefined);
      previewBlobRef.current = finalBlob;
      const url = URL.createObjectURL(finalBlob);
      setPreviewUrl(url);
      setStep('review');
      window.setTimeout(() => previewVideoRef.current?.play().catch(() => undefined), 250);
      return finalBlob;
    } catch {
      setStep('review');
      setError('Não consegui gerar a prévia processada neste navegador. Você ainda pode enviar a prévia original.');
      return null;
    }
  }

  async function submitDuet(finalCaption: string, forceCommunity = postCommunity) {
    let finalBlob = previewBlobRef.current;
    if (!finalBlob) return setError('Grave o dueto antes de enviar.');
    setIsSubmitting(true);
    setError('');
    if (visualBlobRef.current && micBlobRef.current && finalBlob === rawPreviewBlobRef.current) {
      finalBlob = (await renderSmulePreview()) || finalBlob;
    }
    try {
      const data = new FormData();
      const fileType = finalBlob.type || 'video/webm';
      const extension = fileType.includes('mp4') ? 'mp4' : 'webm';
      data.set('lesson_slug', lessonSlug);
      data.set('caption', finalCaption);
      data.set('visibility', forceCommunity ? 'community' : 'private');
      data.set('voice_volume', String(voiceVolume));
      data.set('reference_volume', String(referenceVolume));
      data.set('voice_preset', preset);
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
      setError('Não consegui enviar sua atividade.');
    }
  }

  function publishReview() {
    if (postCommunity) { setStep('caption'); return; }
    submitDuet('', false);
  }

  function finishPost() {
    submitDuet(caption || 'Minha prática do dueto.', true);
  }

  const canRender = Boolean(visualBlobRef.current && micBlobRef.current);

  return (
    <div className="duet-remix-studio real-duet-studio premium-duet-studio reels-duet-editor smule-duet-studio">
      <section className="duet-remix-header premium-duet-header reels-duet-topbar">
        <div>
          <p className="eyebrow">Atividade prática</p>
          <h1>Grave seu dueto</h1>
          <p className="muted">Aula: {lessonTitle}</p>
          <div className="premium-duet-steps"><span><Video size={16} /> Grave</span><span><Wand2 size={16} /> Efeito</span><span><Send size={16} /> Envie</span></div>
        </div>
        <div className="duet-instruction compact premium-duet-instruction"><Headphones size={24} /><div><strong>Use fone de ouvido</strong><p>A gravação fica estável. Depois o Hub renderiza uma prévia única com sua voz, referência e efeito vocal.</p></div></div>
      </section>

      {error ? <p className="duet-error premium-duet-error">{error}</p> : null}

      <section className="real-duet-stage premium-duet-stage reels-duet-preview">
        <video ref={referenceVideoRef} className="ios-duet-source" src={referenceSource} crossOrigin="anonymous" playsInline muted preload="auto" />
        <video ref={cameraRef} className="ios-duet-source" autoPlay muted playsInline />
        {previewUrl ? <video ref={previewVideoRef} className="duet-final-video realtime-duet-video" src={previewUrl} controls playsInline /> : <canvas ref={canvasRef} className="duet-canvas" width={1280} height={720} />}
        {step === 'intro' ? <div className="duet-stage-overlay premium-duet-overlay"><div className="premium-duet-start-card"><span><Sparkles size={20} /> Pronto para praticar?</span><h2>Grave sua segunda voz junto com a referência.</h2><p>Prepare o fone, posicione a câmera e clique para iniciar a contagem.</p><button className="button premium-primary-button" onClick={startCountdown}><Mic size={18} /> Iniciar dueto</button></div></div> : null}
        {step === 'loading' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">Preparando vídeo e câmera...</span></div> : null}
        {step === 'countdown' ? <div className="countdown overlay-countdown">{count}</div> : null}
        {step === 'recording' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">● Gravando...</span></div> : null}
        {step === 'rendering' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">Renderizando prévia com efeito...</span></div> : null}
        {step === 'review' ? <div className="reels-video-chip"><Music2 size={17} /> {lessonTitle}</div> : null}
      </section>

      {step === 'review' || step === 'rendering' ? (
        <section className="smule-mixer-panel">
          <header>
            <div><p className="eyebrow">Mixer Smule</p><h2>Equilibre e escolha o efeito</h2></div>
            <button type="button" onClick={() => { setVoiceVolume(125); setReferenceVolume(45); setPreset('worship'); }}>Reset</button>
          </header>
          <div className="smule-slider-row"><span><Mic size={17} /> Voz</span><input type="range" min="0" max="200" value={voiceVolume} onChange={(e) => setVoiceVolume(Number(e.target.value))} /><strong>{voiceVolume}%</strong></div>
          <div className="smule-slider-row"><span><Music2 size={17} /> Referência</span><input type="range" min="0" max="120" value={referenceVolume} onChange={(e) => setReferenceVolume(Number(e.target.value))} /><strong>{referenceVolume}%</strong></div>
          <div className="smule-preset-grid">
            {presets.map((item) => <button type="button" className={preset === item.id ? 'active' : ''} onClick={() => setPreset(item.id)} key={item.id}><strong>{item.label}</strong><small>{item.description}</small></button>)}
          </div>
          <button type="button" className="smule-render-button" disabled={!canRender || step === 'rendering'} onClick={renderSmulePreview}><Wand2 size={18} /> {step === 'rendering' ? 'Gerando...' : 'Gerar prévia profissional'}</button>
          <p className="smule-note"><Headphones size={15} /> O player toca apenas um vídeo final renderizado. Isso elimina latência, drift e áudio picotado.</p>
        </section>
      ) : null}

      <section className="duet-control-bar premium-duet-control-bar reels-review-actions">
        {step === 'recording' ? <><span className="recording-dot">● Gravando dueto</span><button className="button danger" onClick={stopRecording}>Finalizar gravação</button></> : null}
        {step === 'review' ? <><button className="button secondary" onClick={reset}><RefreshCcw size={16} /> Regravar</button><label className="community-toggle review-community-toggle"><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Publicar também na comunidade</label><button className="button" onClick={publishReview} disabled={isSubmitting}><UploadCloud size={16} /> {isSubmitting ? 'Enviando...' : 'Enviar para avaliação'}</button></> : null}
      </section>

      {step === 'review' ? <section className="duet-review-note premium-duet-note"><CheckCircle2 size={24} /><div><h2>Dueto pronto</h2><p>Ajuste os volumes, escolha um efeito e gere uma prévia única antes de enviar.</p></div></section> : null}
      {step === 'caption' ? <section className="caption-box duet-caption-box premium-duet-note reels-publish-card"><div><h2>Legenda da comunidade</h2><p>Compartilhe sua prática no feed.</p><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda para o feed..." /></div><button className="button" onClick={finishPost} disabled={isSubmitting}>{isSubmitting ? 'Enviando...' : 'Publicar no feed e enviar'}</button></section> : null}
      {step === 'posted' ? <section className="posted-box duet-posted-box premium-duet-note"><CheckCircle2 size={28} /><div><h2>Atividade enviada</h2><p>Sua gravação entrou na fila de avaliação do professor.</p><a className="button secondary" href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
    </div>
  );
}
