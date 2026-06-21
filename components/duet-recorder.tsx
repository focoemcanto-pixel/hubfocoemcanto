'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Headphones, Mic, RefreshCcw, Send, SlidersHorizontal, Sparkles, UploadCloud, Video } from 'lucide-react';

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

function waitForVideoPlay(video: HTMLVideoElement) {
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
  const [postCommunity, setPostCommunity] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAudioEditor, setShowAudioEditor] = useState(false);
  const [referenceVolume, setReferenceVolume] = useState(45);
  const [voiceVolume, setVoiceVolume] = useState(125);
  const [previewAdjusted, setPreviewAdjusted] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);

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
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
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
    setPreviewAdjusted(false);
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
    ctx.fillStyle = 'rgba(0,0,0,.55)';
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
    const audioContext = new AudioCtx();
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();
    try {
      const micSource = audioContext.createMediaStreamSource(micStream);
      const micGain = audioContext.createGain();
      micGain.gain.value = voiceVolume / 100;
      micSource.connect(micGain);
      micGain.connect(destination);
    } catch {}
    try {
      const referenceSourceNode = audioContext.createMediaElementSource(reference);
      const referenceGain = audioContext.createGain();
      referenceGain.gain.value = referenceVolume / 100;
      referenceSourceNode.connect(referenceGain);
      referenceGain.connect(destination);
      referenceGain.connect(audioContext.destination);
    } catch {}
    return destination.stream.getAudioTracks();
  }

  function startSideRecorder(stream: MediaStream, chunks: Blob[], kind: 'video' | 'audio') {
    if (!stream.getTracks().length) return null;
    const type = kind === 'video' ? videoOnlyMimeType() : audioOnlyMimeType();
    try {
      const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.start(1000);
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
    const recorder = mimeType ? new MediaRecorder(mixedStream, { mimeType }) : new MediaRecorder(mixedStream);
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
        if (visualChunksRef.current.length) visualBlobRef.current = new Blob(visualChunksRef.current, { type: visualRecorderRef.current?.mimeType || videoOnlyMimeType() || 'video/webm' });
        if (micChunksRef.current.length) micBlobRef.current = new Blob(micChunksRef.current, { type: micRecorderRef.current?.mimeType || audioOnlyMimeType() || 'audio/webm' });
      }, 350);
      setShowAudioEditor(true);
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
    clearDrawLoop();
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close().catch(() => undefined);
    setRecordedUrl(null);
    recordedBlobRef.current = null;
    visualBlobRef.current = null;
    micBlobRef.current = null;
    setCaption('');
    setPostCommunity(false);
    setPreviewAdjusted(false);
    setStep('intro');
  }

  async function applyPreviewAudioBalance() {
    const visualBlob = visualBlobRef.current;
    const micBlob = micBlobRef.current;
    if (!visualBlob || !micBlob || !referenceSource) {
      setError('Essa gravação antiga não tem trilhas separadas para remixar. Regrave uma vez e depois ajuste livremente antes de enviar.');
      return;
    }
    setIsRemixing(true);
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
      mic.muted = true;
      reference.muted = true;
      visual.playsInline = true;
      reference.playsInline = true;
      await Promise.all([waitForVideoPlay(visual), waitForVideoPlay(reference)]);

      const canvas = document.createElement('canvas');
      canvas.width = isSafariLike() ? 960 : 1280;
      canvas.height = isSafariLike() ? 540 : 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_failed');
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) throw new Error('audio_context_failed');
      const audioContext = new AudioCtx();
      const destination = audioContext.createMediaStreamDestination();
      const referenceSourceNode = audioContext.createMediaElementSource(reference);
      const referenceGain = audioContext.createGain();
      referenceGain.gain.value = referenceVolume / 100;
      referenceSourceNode.connect(referenceGain);
      referenceGain.connect(destination);
      const micSourceNode = audioContext.createMediaElementSource(mic);
      const micGain = audioContext.createGain();
      micGain.gain.value = voiceVolume / 100;
      micSourceNode.connect(micGain);
      micGain.connect(destination);

      const outputStream = new MediaStream([...canvas.captureStream(isSafariLike() ? 24 : 30).getVideoTracks(), ...destination.stream.getAudioTracks()]);
      const mimeType = recorderMimeType();
      const recorder = mimeType ? new MediaRecorder(outputStream, { mimeType }) : new MediaRecorder(outputStream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
      });
      const draw = () => {
        if (visual.ended || visual.paused) return;
        ctx.drawImage(visual, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
      };
      recorder.start(1000);
      visual.currentTime = 0;
      reference.currentTime = 0;
      mic.currentTime = 0;
      await audioContext.resume().catch(() => undefined);
      await Promise.all([visual.play(), reference.play(), mic.play()]);
      draw();
      visual.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
      window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, Math.max(2500, (visual.duration || 90) * 1000 + 800));
      const remixed = await done;
      recordedBlobRef.current = remixed;
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(URL.createObjectURL(remixed));
      setPreviewAdjusted(true);
      await audioContext.close().catch(() => undefined);
    } catch {
      setError('Não consegui remixar essa prévia neste navegador. Regrave com o equilíbrio escolhido antes de enviar.');
    } finally {
      setIsRemixing(false);
    }
  }

  async function submitDuet(finalCaption: string, forceCommunity = postCommunity) {
    if (!recordedBlobRef.current) return setError('Grave o dueto antes de enviar.');
    setIsSubmitting(true);
    setError('');
    const data = new FormData();
    const fileType = recordedBlobRef.current.type || 'video/webm';
    const extension = fileType.includes('mp4') ? 'mp4' : 'webm';
    data.set('lesson_slug', lessonSlug);
    data.set('caption', finalCaption);
    data.set('visibility', forceCommunity ? 'community' : 'private');
    data.set('file', new File([recordedBlobRef.current], `${lessonSlug}-dueto.${extension}`, { type: fileType }));
    const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      setError(json?.detail || json?.message || 'Não consegui enviar sua atividade.');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    setStep('posted');
  }

  function publishReview() {
    if (postCommunity) { setStep('caption'); return; }
    submitDuet('', false);
  }

  function finishPost() {
    submitDuet(caption || 'Minha prática do dueto.', true);
  }

  return (
    <div className="duet-remix-studio real-duet-studio premium-duet-studio">
      <section className="duet-remix-header premium-duet-header">
        <div>
          <p className="eyebrow">Atividade prática</p>
          <h1>Grave seu dueto</h1>
          <p className="muted">Aula: {lessonTitle}</p>
          <div className="premium-duet-steps"><span><Video size={16} /> Assista</span><span><Mic size={16} /> Grave</span><span><Send size={16} /> Envie</span></div>
        </div>
        <div className="duet-instruction compact premium-duet-instruction"><Headphones size={24} /><div><strong>Use fone de ouvido</strong><p>O vídeo da atividade e sua câmera entram no mesmo quadro. No final, o arquivo gerado já sai como dueto com os dois áudios.</p></div></div>
      </section>

      {error ? <p className="duet-error premium-duet-error">{error}</p> : null}

      <section className="premium-audio-editor-toggle">
        <button type="button" onClick={() => setShowAudioEditor((value) => !value)}><SlidersHorizontal size={18} /> Editar equilíbrio do áudio</button>
        <span>Referência {referenceVolume}% · Sua voz {voiceVolume}%</span>
      </section>

      {showAudioEditor ? (
        <section className="premium-audio-editor">
          <div><label>Volume da referência</label><input type="range" min="10" max="100" value={referenceVolume} onChange={(event) => { setReferenceVolume(Number(event.target.value)); setPreviewAdjusted(false); }} /><strong>{referenceVolume}%</strong></div>
          <div><label>Volume da sua voz</label><input type="range" min="60" max="180" value={voiceVolume} onChange={(event) => { setVoiceVolume(Number(event.target.value)); setPreviewAdjusted(false); }} /><strong>{voiceVolume}%</strong></div>
          <p>{step === 'review' ? 'Ajuste depois da gravação e clique para reprocessar a prévia. O vídeo enviado usa a prévia reprocessada.' : 'Ajuste antes de gravar. Para deixar o dueto evidente, reduza a referência e aumente sua voz.'}</p>
          {step === 'review' ? <button className="button secondary premium-apply-audio" type="button" onClick={applyPreviewAudioBalance} disabled={isRemixing}>{isRemixing ? 'Reprocessando...' : previewAdjusted ? 'Prévia reprocessada' : 'Aplicar na prévia'}</button> : null}
        </section>
      ) : null}

      <section className="real-duet-stage premium-duet-stage">
        <video ref={referenceVideoRef} className="ios-duet-source" src={referenceSource} crossOrigin="anonymous" playsInline muted preload="auto" />
        <video ref={cameraRef} className="ios-duet-source" autoPlay muted playsInline />
        {recordedUrl ? <video ref={recordedVideoRef} className="duet-final-video" src={recordedUrl} controls playsInline /> : <canvas ref={canvasRef} className="duet-canvas" width={1280} height={720} />}
        {step === 'intro' ? <div className="duet-stage-overlay premium-duet-overlay"><div className="premium-duet-start-card"><span><Sparkles size={20} /> Pronto para praticar?</span><h2>Grave sua segunda voz junto com a referência.</h2><p>Prepare o fone, posicione a câmera e clique para iniciar a contagem.</p><button className="button premium-primary-button" onClick={startCountdown}><Mic size={18} /> Iniciar dueto</button></div></div> : null}
        {step === 'loading' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">Preparando vídeo e câmera...</span></div> : null}
        {step === 'countdown' ? <div className="countdown overlay-countdown">{count}</div> : null}
      </section>

      <section className="duet-control-bar premium-duet-control-bar">
        {step === 'recording' ? <><span className="recording-dot">● Gravando dueto real</span><button className="button danger" onClick={stopRecording}>Finalizar gravação</button></> : null}
        {step === 'review' ? <><button className="button secondary" onClick={reset}><RefreshCcw size={16} /> Regravar</button><label className="community-toggle review-community-toggle"><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Publicar também na comunidade</label><button className="button" onClick={publishReview} disabled={isSubmitting || isRemixing}><UploadCloud size={16} /> {isSubmitting ? 'Enviando...' : 'Enviar para avaliação'}</button></> : null}
      </section>

      {step === 'review' ? <section className="duet-review-note premium-duet-note"><CheckCircle2 size={24} /><div><h2>Dueto gerado</h2><p>Confira o vídeo, ajuste o equilíbrio se necessário e envie. Marcando a comunidade, você escreve uma legenda antes de publicar.</p></div></section> : null}
      {step === 'caption' ? <section className="caption-box duet-caption-box premium-duet-note"><h2>Legenda da comunidade</h2><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda para o feed..." /><button className="button" onClick={finishPost} disabled={isSubmitting}>{isSubmitting ? 'Publicando...' : 'Publicar no feed e enviar'}</button></section> : null}
      {step === 'posted' ? <section className="posted-box duet-posted-box premium-duet-note"><CheckCircle2 size={28} /><div><h2>Atividade enviada</h2><p>Sua gravação entrou na fila de avaliação do professor.</p><a className="button secondary" href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
    </div>
  );
}
