'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Mic, RefreshCcw, Send, Square, Video } from 'lucide-react';
import { proxiedVideoUrl } from '@/lib/audio/duet-recording-utils';
import { startDuetV2Session, type DuetV2RecordingResult, type DuetV2Session } from '@/lib/audio-v2';

type Props = {
  lessonTitle: string;
  lessonSlug: string;
  referenceUrl?: string | null;
  referenceEmbedUrl?: string | null;
  canSendForReview?: boolean;
};

type Step = 'intro' | 'recording' | 'review' | 'posting' | 'posted';

function blobUrl(blob?: Blob | null) {
  return blob ? URL.createObjectURL(blob) : '';
}

function blobStatus(label: string, blob?: Blob | null, chunks?: number) {
  const ok = Boolean(blob && blob.size > 0);
  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
      <span>{ok ? '✅' : '⚠️'} {label}</span>
      <strong>{ok ? `${Math.round((blob?.size || 0) / 1024)} KB` : 'vazio'}{typeof chunks === 'number' ? ` · ${chunks} chunks` : ''}</strong>
    </li>
  );
}

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl, canSendForReview = true }: Props) {
  const referenceSource = useMemo(() => proxiedVideoUrl(referenceUrl), [referenceUrl]);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const referenceRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<DuetV2Session | null>(null);
  const [step, setStep] = useState<Step>('intro');
  const [error, setError] = useState('');
  const [result, setResult] = useState<DuetV2RecordingResult | null>(null);
  const [caption, setCaption] = useState('Minha prática do dueto.');
  const [postCommunity, setPostCommunity] = useState(!canSendForReview);
  const [sendForReview, setSendForReview] = useState(canSendForReview);
  const [postedHref, setPostedHref] = useState('');

  const previewUrl = useMemo(() => blobUrl(result?.mixedBlob || result?.canvasBlob), [result]);

  async function startRecording() {
    setError('');
    setResult(null);
    setPostedHref('');
    if (!referenceSource) {
      setError('Essa atividade ainda não tem vídeo de referência vinculado.');
      return;
    }
    try {
      const session = await startDuetV2Session({ referenceUrl: referenceSource }, { camera: cameraRef.current, reference: referenceRef.current, canvas: canvasRef.current });
      sessionRef.current = session;
      setStep('recording');
    } catch (err: any) {
      setStep('intro');
      setError(err?.message || 'Não consegui iniciar a gravação. Permita câmera e microfone e tente novamente.');
    }
  }

  async function stopRecording() {
    setError('');
    const session = sessionRef.current;
    if (!session) return;
    try {
      const recording = await session.stop();
      sessionRef.current = null;
      setResult(recording);
      setStep('review');
    } catch (err: any) {
      setError(err?.message || 'Não consegui finalizar a gravação.');
      setStep('intro');
    }
  }

  function reset() {
    setResult(null);
    setError('');
    setPostedHref('');
    setStep('intro');
  }

  async function submit() {
    if (!result?.mixedBlob && !result?.canvasBlob) {
      setError('Grave o dueto antes de enviar.');
      return;
    }
    const visibility = postCommunity ? 'community' : 'private';
    const reviewRequested = canSendForReview && sendForReview;
    if (!postCommunity && !reviewRequested) {
      setError(canSendForReview ? 'Escolha postar na comunidade, enviar para avaliação ou os dois.' : 'No modo gratuito, poste na comunidade para continuar.');
      return;
    }
    setStep('posting');
    setError('');
    try {
      const uploadBlob = result.mixedBlob || result.canvasBlob!;
      const data = new FormData();
      const fileType = uploadBlob.type || 'video/webm';
      data.set('lesson_slug', lessonSlug);
      data.set('caption', caption || 'Minha prática do dueto.');
      data.set('visibility', visibility);
      data.set('review_requested', String(reviewRequested));
      data.set('voice_volume', '100');
      data.set('reference_volume', '100');
      data.set('voice_preset', 'natural');
      data.set('noise_reduction', 'false');
      data.set('file', new File([uploadBlob], `${lessonSlug}-dueto-v2.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.detail || json?.message || 'Não consegui enviar sua atividade.');
      }
      const json = await response.json().catch(() => null);
      const communityPostId = String(json?.community_post_id || '');
      setPostedHref(postCommunity ? `/aluno/comunidade${communityPostId ? `#post-${communityPostId}` : ''}` : '');
      setStep('posted');
    } catch (err: any) {
      setError(err?.message || 'Não consegui enviar sua atividade.');
      setStep('review');
    }
  }

  const box: React.CSSProperties = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, background: 'rgba(255,255,255,.06)', padding: 18 };
  const button: React.CSSProperties = { border: 0, borderRadius: 999, padding: '13px 18px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' };

  return (
    <main style={{ minHeight: '100dvh', background: '#050507', color: '#fff', padding: 18 }}>
      <section style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={box}>
          <p style={{ color: '#f5c76b', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 900, margin: 0 }}>Dueto V2</p>
          <h1 style={{ margin: '8px 0 4px', fontSize: 34 }}>Grave seu dueto</h1>
          <p style={{ margin: 0, opacity: .72 }}>Aula: {lessonTitle}</p>
        </header>

        {error ? <div style={{ ...box, borderColor: 'rgba(255,80,80,.45)', color: '#ffb4b4' }}>{error}</div> : null}

        <section style={{ ...box, position: 'relative', overflow: 'hidden', padding: 0, aspectRatio: '16/9', display: 'grid', placeItems: 'center', background: '#000' }}>
          <video ref={referenceRef} playsInline muted style={{ display: 'none' }} />
          <video ref={cameraRef} playsInline muted autoPlay style={{ display: 'none' }} />
          {previewUrl && step !== 'recording' ? (
            <video src={previewUrl} playsInline controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {step === 'intro' ? <div style={{ position: 'absolute', textAlign: 'center', display: 'grid', gap: 10, placeItems: 'center' }}><Video size={44} /><strong>Toque em iniciar para abrir câmera e referência</strong></div> : null}
          {step === 'recording' ? <div style={{ position: 'absolute', top: 14, left: 14, background: '#e11d48', borderRadius: 999, padding: '8px 12px', fontWeight: 900 }}>● Gravando</div> : null}
        </section>

        <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {step === 'intro' ? <button style={{ ...button, background: '#f5c76b', color: '#17120a' }} onClick={startRecording}><Mic size={18} /> Iniciar gravação</button> : null}
          {step === 'recording' ? <button style={{ ...button, background: '#e11d48', color: '#fff' }} onClick={stopRecording}><Square size={18} /> Finalizar</button> : null}
          {step === 'review' ? <><button style={{ ...button, background: 'rgba(255,255,255,.12)', color: '#fff' }} onClick={reset}><RefreshCcw size={18} /> Regravar</button><button style={{ ...button, background: '#f5c76b', color: '#17120a' }} onClick={submit}><Send size={18} /> Continuar envio</button></> : null}
          {step === 'posting' ? <button style={{ ...button, background: 'rgba(255,255,255,.12)', color: '#fff' }} disabled>Enviando...</button> : null}
        </section>

        {result ? <section style={box}>
          <h2 style={{ marginTop: 0 }}>Diagnóstico da gravação</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {blobStatus('Vídeo da câmera', result.cameraBlob, result.diagnostics.cameraChunks)}
            {blobStatus('Vídeo do canvas', result.canvasBlob, result.diagnostics.canvasChunks)}
            {blobStatus('Voz gravada', result.voiceBlob, result.diagnostics.voiceChunks)}
            {blobStatus('Referência separada', result.referenceBlob, result.diagnostics.referenceChunks)}
            {blobStatus('Vídeo final bruto', result.mixedBlob, result.diagnostics.mixedChunks)}
          </ul>
          <p style={{ opacity: .7 }}>Duração: {Math.round(result.durationMs / 1000)}s · Track referência: {result.diagnostics.hasReferenceTrack ? 'sim' : 'não'} · Track mic: {result.diagnostics.hasMicrophoneTrack ? 'sim' : 'não'}</p>
        </section> : null}

        {step === 'review' ? <section style={box}>
          <h2 style={{ marginTop: 0 }}>Publicação</h2>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Postar na comunidade</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, opacity: canSendForReview ? 1 : .55 }}><input type="checkbox" checked={sendForReview && canSendForReview} disabled={!canSendForReview} onChange={(event) => setSendForReview(event.target.checked)} /> Enviar para avaliação</label>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} style={{ width: '100%', minHeight: 100, borderRadius: 16, padding: 14, background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.12)' }} />
        </section> : null}

        {step === 'posted' ? <section style={box}>
          <CheckCircle2 color="#86efac" size={34} />
          <h2>Vídeo enviado</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {postedHref ? <a style={{ ...button, background: '#f5c76b', color: '#17120a', textDecoration: 'none' }} href={postedHref}>Ver postagem</a> : null}
            <a style={{ ...button, background: 'rgba(255,255,255,.12)', color: '#fff', textDecoration: 'none' }} href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a>
          </div>
        </section> : null}
      </section>
    </main>
  );
}
