'use client';

import { useMemo, useRef, useState } from 'react';

type Props = {
  lessonTitle: string;
  lessonSlug: string;
};

type Step = 'intro' | 'countdown' | 'recording' | 'review' | 'caption' | 'posted';

export function DuetRecorder({ lessonTitle, lessonSlug }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [count, setCount] = useState(3);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [postCommunity, setPostCommunity] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const canRecord = useMemo(() => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, []);

  async function startCountdown() {
    setError('');
    if (!canRecord) {
      setError('Seu navegador não liberou gravação por câmera/microfone. Tente pelo Chrome ou Safari atualizado.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (previewRef.current) previewRef.current.srcObject = stream;
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

  function beginRecording(stream: MediaStream) {
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
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
    <div className="duet-studio">
      <section className="duet-panel">
        <p className="eyebrow">Atividade prática</p>
        <h1>Grave seu dueto</h1>
        <p className="muted">Aula: {lessonTitle}</p>
        <div className="duet-instruction">
          <strong>Antes de gravar</strong>
          <p>Use fone de ouvido para ouvir a referência e captar melhor sua voz. Cante junto com o vídeo da aula e envie sua resposta para avaliação.</p>
        </div>
        {error ? <p className="duet-error">{error}</p> : null}

        {step === 'intro' ? (
          <button className="button" onClick={startCountdown}>Começar gravação</button>
        ) : null}

        {step === 'countdown' ? <div className="countdown">{count}</div> : null}

        {step === 'recording' ? (
          <div className="recording-actions">
            <span className="recording-dot">● Gravando</span>
            <button className="button danger" onClick={stopRecording}>Finalizar</button>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="review-actions">
            <button className="button secondary" onClick={reset}>Regravar</button>
            <button className="button" onClick={publish}>Postar atividade</button>
            <label className="community-toggle"><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Postar também na comunidade</label>
          </div>
        ) : null}

        {step === 'caption' ? (
          <div className="caption-box">
            <h2>Legenda da comunidade</h2>
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda como no Instagram..." />
            <button className="button" onClick={finishPost}>Publicar na comunidade</button>
          </div>
        ) : null}

        {step === 'posted' ? (
          <div className="posted-box">
            <h2>Atividade enviada</h2>
            <p>Sua gravação entrou na fila de avaliação do professor.</p>
            <a className="button secondary" href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a>
          </div>
        ) : null}
      </section>

      <section className="duet-preview">
        <div className="duet-video-card">
          {recordedUrl ? <video src={recordedUrl} controls /> : <video ref={previewRef} autoPlay muted playsInline />}
          {!recordedUrl ? <span className="duet-watermark">Sua câmera</span> : null}
        </div>
        <div className="duet-reference-card">
          <strong>Referência</strong>
          <p>Deixe o vídeo da aula aberto ao lado e grave sua resposta ouvindo pelo fone.</p>
        </div>
      </section>
    </div>
  );
}
