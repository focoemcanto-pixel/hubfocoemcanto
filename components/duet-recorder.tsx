'use client';

import { useMemo, useRef, useState } from 'react';

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
  const id = driveFileId(url);
  if (id) return `/api/drive/video/${id}`;
  return url || '';
}

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [count, setCount] = useState(3);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [postCommunity, setPostCommunity] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const referenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawLoopRef = useRef<number | null>(null);

  const canRecord = useMemo(() => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, []);
  const referenceSource = proxiedVideoUrl(referenceUrl);

  function waitForReferenceVideo() {
    return new Promise<void>((resolve, reject) => {
      const video = referenceVideoRef.current;
      if (!video || !referenceSource) {
        reject(new Error('missing_reference'));
        return;
      }
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve();
        return;
      }

      const timeout = window.setTimeout(() => cleanup(() => reject(new Error('timeout'))), 12000);
      const onReady = () => cleanup(resolve);
      const onError = () => cleanup(() => reject(new Error('load_error')));
      const cleanup = (done: () => void) => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        done();
      };

      video.addEventListener('loadeddata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
      video.load();
    });
  }

  async function startCountdown() {
    setError('');
    setRecordedUrl(null);
    if (!canRecord) {
      setError('Seu navegador não liberou gravação por câmera/microfone. Tente pelo Chrome ou Safari atualizado.');
      return;
    }
    if (!referenceSource) {
      setError('Essa atividade ainda não tem vídeo de referência vinculado.');
      return;
    }

    setStep('loading');
    try {
      await waitForReferenceVideo();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      cameraStreamRef.current = stream;
      if (cameraRef.current) cameraRef.current.srcObject = stream;
      setStep('countdown');
      let next = 3;
      setCount(next);
      const timer = window.setInterval(() => {
        next -= 1;
        if (next <= 0) {
          window.clearInterval(timer);
          beginDuetRecording(stream);
        } else {
          setCount(next);
        }
      }, 1000);
    } catch {
      setStep('intro');
      setError('O vídeo de referência não carregou. Refaça a conexão com o Google Drive ou importe novamente esse arquivo no módulo.');
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

  function drawDuetFrame() {
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
    if (camera.readyState >= 2) drawCover(ctx, camera, half, 0, half, height);

    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, width, 54);
    ctx.fillStyle = '#fff';
    ctx.font = '700 22px Arial';
    ctx.fillText('Referência', 24, 35);
    ctx.fillText('Aluno', half + 24, 35);

    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, height);
    ctx.stroke();

    drawLoopRef.current = requestAnimationFrame(drawDuetFrame);
  }

  async function beginDuetRecording(stream: MediaStream) {
    chunksRef.current = [];
    const canvas = canvasRef.current;
    const reference = referenceVideoRef.current;

    if (!canvas || !reference || reference.readyState < 2 || reference.videoWidth === 0) {
      setError('A referência ainda não está pronta. Tente iniciar novamente.');
      setStep('intro');
      return;
    }

    canvas.width = 1280;
    canvas.height = 720;
    reference.currentTime = 0;
    await reference.play();

    drawDuetFrame();

    const canvasStream = canvas.captureStream(30);
    const audioTracks = stream.getAudioTracks();
    const mixedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    const recorder = new MediaRecorder(mixedStream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm' });

    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      if (drawLoopRef.current) cancelAnimationFrame(drawLoopRef.current);
      reference.pause();
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((track) => track.stop());
      setStep('review');
    };

    recorder.start();
    setStep('recording');
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function reset() {
    if (drawLoopRef.current) cancelAnimationFrame(drawLoopRef.current);
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    setRecordedUrl(null);
    setCaption('');
    setPostCommunity(false);
    setStep('intro');
  }

  function publish() {
    if (postCommunity) setStep('caption');
    else setStep('posted');
  }

  function finishPost() {
    setStep('posted');
  }

  return (
    <div className="duet-remix-studio real-duet-studio">
      <section className="duet-remix-header">
        <div>
          <p className="eyebrow">Atividade prática</p>
          <h1>Grave seu dueto</h1>
          <p className="muted">Aula: {lessonTitle}</p>
        </div>
        <div className="duet-instruction compact">
          <strong>Use fone de ouvido</strong>
          <p>O vídeo da atividade e sua câmera entram no mesmo quadro. No final, o arquivo gerado já sai como dueto para avaliação.</p>
        </div>
      </section>

      {error ? <p className="duet-error">{error}</p> : null}

      <section className="real-duet-stage">
        <video ref={referenceVideoRef} className="hidden-duet-source" src={referenceSource} crossOrigin="anonymous" playsInline preload="auto" />
        <video ref={cameraRef} className="hidden-duet-source" autoPlay muted playsInline />

        {recordedUrl ? (
          <video className="duet-final-video" src={recordedUrl} controls />
        ) : (
          <canvas ref={canvasRef} className="duet-canvas" width={1280} height={720} />
        )}

        {step === 'intro' ? <div className="duet-stage-overlay"><button className="button" onClick={startCountdown}>Iniciar dueto</button></div> : null}
        {step === 'loading' ? <div className="duet-stage-overlay"><span className="recording-dot">Carregando referência...</span></div> : null}
        {step === 'countdown' ? <div className="countdown overlay-countdown">{count}</div> : null}
      </section>

      <section className="duet-control-bar">
        {step === 'recording' ? (
          <>
            <span className="recording-dot">● Gravando dueto real</span>
            <button className="button danger" onClick={stopRecording}>Finalizar gravação</button>
          </>
        ) : null}
        {step === 'review' ? (
          <>
            <button className="button secondary" onClick={reset}>Regravar</button>
            {recordedUrl ? <a className="button secondary" href={recordedUrl} download={`${lessonSlug}-dueto.webm`}>Baixar prévia</a> : null}
            <button className="button" onClick={publish}>Enviar para avaliação</button>
            <label className="community-toggle"><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Postar também na comunidade</label>
          </>
        ) : null}
      </section>

      {step === 'review' ? (
        <section className="duet-review-note">
          <h2>Dueto gerado</h2>
          <p>Agora sim: a referência e o aluno estão no mesmo vídeo. O próximo passo é salvar esse arquivo no storage e enviar para a fila de avaliação.</p>
        </section>
      ) : null}

      {step === 'caption' ? (
        <section className="caption-box duet-caption-box">
          <h2>Legenda da comunidade</h2>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda como no Instagram..." />
          <button className="button" onClick={finishPost}>Publicar na comunidade</button>
        </section>
      ) : null}

      {step === 'posted' ? (
        <section className="posted-box duet-posted-box">
          <h2>Atividade enviada</h2>
          <p>Sua gravação entrou na fila de avaliação do professor.</p>
          <a className="button secondary" href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a>
        </section>
      ) : null}
    </div>
  );
}
