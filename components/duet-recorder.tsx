'use client';

import { useMemo, useRef, useState } from 'react';

type Props = {
  lessonTitle: string;
  lessonSlug: string;
  referenceUrl?: string | null;
  referenceEmbedUrl?: string | null;
};

type Step = 'intro' | 'countdown' | 'recording' | 'review' | 'caption' | 'posted';

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function toDrivePreview(url?: string | null) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : url || '';
}

function isDirectVideo(url?: string | null) {
  if (!url) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl, referenceEmbedUrl }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [count, setCount] = useState(3);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [postCommunity, setPostCommunity] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const referenceVideoRef = useRef<HTMLVideoElement | null>(null);

  const canRecord = useMemo(() => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, []);
  const referencePreview = referenceEmbedUrl || toDrivePreview(referenceUrl);
  const useNativeReferenceVideo = isDirectVideo(referenceUrl);

  async function startCountdown() {
    setError('');
    if (!canRecord) {
      setError('Seu navegador não liberou gravação por câmera/microfone. Tente pelo Chrome ou Safari atualizado.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (cameraRef.current) cameraRef.current.srcObject = stream;
      setStep('countdown');
      let next = 3;
      setCount(next);
      const timer = window.setInterval(() => {
        next -= 1;
        if (next <= 0) {
          window.clearInterval(timer);
          beginRecording(stream);
        } else {
          setCount(next);
        }
      }, 1000);
    } catch {
      setError('Não consegui acessar câmera/microfone. Libere a permissão do navegador e tente novamente.');
    }
  }

  async function beginRecording(stream: MediaStream) {
    chunksRef.current = [];
    if (referenceVideoRef.current) {
      referenceVideoRef.current.currentTime = 0;
      await referenceVideoRef.current.play().catch(() => undefined);
    }

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((track) => track.stop());
      referenceVideoRef.current?.pause();
      setStep('review');
    };
    recorder.start();
    setStep('recording');
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function reset() {
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
    <div className="duet-remix-studio">
      <section className="duet-remix-header">
        <div>
          <p className="eyebrow">Atividade prática</p>
          <h1>Grave seu dueto</h1>
          <p className="muted">Aula: {lessonTitle}</p>
        </div>
        <div className="duet-instruction compact">
          <strong>Use fone de ouvido</strong>
          <p>O vídeo da atividade toca junto com sua gravação. Assim o professor avalia tempo, entrada, sustentação e voz correta.</p>
        </div>
      </section>

      {error ? <p className="duet-error">{error}</p> : null}

      <section className="duet-remix-grid">
        <article className="duet-reference-screen">
          <span className="duet-screen-label">Vídeo da atividade</span>
          {useNativeReferenceVideo ? (
            <video ref={referenceVideoRef} src={referenceUrl || ''} playsInline controls={step !== 'recording'} />
          ) : referencePreview ? (
            <iframe src={referencePreview} allow="autoplay; fullscreen" allowFullScreen />
          ) : (
            <div className="duet-empty-reference">Nenhum vídeo de referência vinculado.</div>
          )}
        </article>

        <article className="duet-camera-screen">
          <span className="duet-screen-label">Aluno</span>
          {recordedUrl ? <video src={recordedUrl} controls /> : <video ref={cameraRef} autoPlay muted playsInline />}
          {step === 'countdown' ? <div className="countdown overlay-countdown">{count}</div> : null}
        </article>
      </section>

      <section className="duet-control-bar">
        {step === 'intro' ? <button className="button" onClick={startCountdown}>Iniciar dueto</button> : null}
        {step === 'recording' ? (
          <>
            <span className="recording-dot">● Gravando com a referência</span>
            <button className="button danger" onClick={stopRecording}>Finalizar gravação</button>
          </>
        ) : null}
        {step === 'review' ? (
          <>
            <button className="button secondary" onClick={reset}>Regravar</button>
            <button className="button" onClick={publish}>Enviar para avaliação</button>
            <label className="community-toggle"><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Postar também na comunidade</label>
          </>
        ) : null}
      </section>

      {step === 'review' ? (
        <section className="duet-review-note">
          <h2>Prévia do dueto</h2>
          <p>A referência e sua gravação ficam lado a lado para avaliação. Na próxima etapa técnica, o backend renderiza os dois em um único arquivo final.</p>
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
