'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Crown, Headphones, Mic, Music2, Pause, Play, RefreshCcw, RotateCcw, Send, SlidersHorizontal, Square, Video } from 'lucide-react';
import { proxiedVideoUrl } from '@/lib/audio/duet-recording-utils';
import { DuetAudioEngine } from '@/lib/audio-engine/duet-audio-engine';
import { DuetPreviewEngine } from '@/lib/audio-engine/duet-preview-engine';
import { DuetRecorderEngine, type DuetRecorderEngineResult } from '@/lib/audio-engine/duet-recorder-engine';
import { DuetRendererEngine } from '@/lib/audio-engine/duet-renderer-engine';
import { attachMediaSource } from '@/lib/media/hls-client';

type Props = { lessonTitle: string; lessonSlug: string; referenceUrl?: string | null; referenceEmbedUrl?: string | null; canSendForReview?: boolean };
type Step = 'intro' | 'countdown' | 'recording' | 'review' | 'posting' | 'posted';
type Preset = 'natural' | 'studio' | 'worship' | 'coral';

function isSafariLike() { if (typeof navigator === 'undefined') return false; const ua = navigator.userAgent; return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua)); }
function errorText(error: unknown) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error || 'erro_desconhecido'); }
function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function waitMediaReady(media: HTMLMediaElement, timeoutMs = 12000) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    let done = false;
    const cleanup = (fn: () => void) => { if (done) return; done = true; window.clearTimeout(timer); media.removeEventListener('loadedmetadata', ok); media.removeEventListener('loadeddata', ok); media.removeEventListener('canplay', ok); media.removeEventListener('error', fail); fn(); };
    const ok = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('media_load_failed')));
    const timer = window.setTimeout(() => cleanup(() => reject(new Error('media_load_timeout'))), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('loadeddata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
}

const presetInfo: Record<Preset, { title: string; text: string; voice: number; reference: number }> = {
  natural: { title: 'Natural', text: 'Limpo e direto.', voice: 100, reference: 70 },
  studio: { title: 'Studio', text: 'Presença e compressão.', voice: 120, reference: 65 },
  worship: { title: 'Worship', text: 'Ambiência de louvor.', voice: 110, reference: 82 },
  coral: { title: 'Coral', text: 'Espaço para segunda voz.', voice: 96, reference: 92 },
};

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl, canSendForReview = true }: Props) {
  const referenceSource = useMemo(() => proxiedVideoUrl(referenceUrl), [referenceUrl]);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const referenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewVisualRef = useRef<HTMLVideoElement | null>(null);
  const previewVoiceRef = useRef<HTMLAudioElement | null>(null);
  const previewReferenceRef = useRef<HTMLAudioElement | null>(null);
  const recorderEngineRef = useRef<DuetRecorderEngine | null>(null);
  const previewEngineRef = useRef<DuetPreviewEngine | null>(null);
  const monitorEngineRef = useRef<DuetAudioEngine | null>(null);
  const monitorMediaRef = useRef<HTMLVideoElement | null>(null);
  const monitorAttachmentRef = useRef<{ destroy: () => void } | null>(null);

  const [step, setStep] = useState<Step>('intro');
  const [error, setError] = useState('');
  const [result, setResult] = useState<DuetRecorderEngineResult | null>(null);
  const [caption, setCaption] = useState('Minha prática do dueto.');
  const [postCommunity, setPostCommunity] = useState(!canSendForReview);
  const [sendForReview, setSendForReview] = useState(canSendForReview);
  const [postedHref, setPostedHref] = useState('');
  const [status, setStatus] = useState('');
  const [postingProgress, setPostingProgress] = useState(0);
  const [voiceVolume, setVoiceVolume] = useState(110);
  const [referenceVolume, setReferenceVolume] = useState(70);
  const [referenceOffsetMs, setReferenceOffsetMsState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [preset, setPreset] = useState<Preset>('studio');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => () => { try { recorderEngineRef.current?.cleanup(); } catch {} previewEngineRef.current?.close().catch(() => undefined); stopReferenceMonitor().catch(() => undefined); }, []);

  async function startReferenceMonitor() {
    if (!referenceSource) return;
    await stopReferenceMonitor();
    const media = document.createElement('video');
    media.preload = 'auto'; media.playsInline = true; media.volume = 0; media.muted = false;
    monitorMediaRef.current = media;
    monitorAttachmentRef.current = await attachMediaSource(media, referenceSource);
    await waitMediaReady(media);
    const engine = new DuetAudioEngine({ latencyHint: 'interactive', sampleRate: 48000 });
    engine.setPreGains({ reference: 0.35, voice: 0 }); engine.setFaders({ reference: 100, voice: 0 }); engine.connectReferenceElement(media);
    monitorEngineRef.current = engine;
    await engine.resume(); media.currentTime = 0; await media.play().catch(() => undefined);
  }

  async function stopReferenceMonitor() {
    try { monitorMediaRef.current?.pause(); } catch {}
    try { monitorAttachmentRef.current?.destroy(); } catch {}
    try { monitorMediaRef.current?.removeAttribute('src'); monitorMediaRef.current?.load(); } catch {}
    await monitorEngineRef.current?.close().catch(() => undefined);
    monitorEngineRef.current = null; monitorMediaRef.current = null; monitorAttachmentRef.current = null;
  }

  async function startRecording() {
    setError(''); setStatus(''); setPostedHref(''); setResult(null); setPostingProgress(0); setPlaying(false);
    if (!referenceSource) return setError('Essa atividade ainda não tem vídeo de referência vinculado.');
    if (!cameraRef.current || !referenceVideoRef.current || !canvasRef.current) return setError('Elementos de gravação indisponíveis.');
    try {
      await previewEngineRef.current?.close().catch(() => undefined); previewEngineRef.current = null;
      const engine = new DuetRecorderEngine({ camera: cameraRef.current, referenceVideo: referenceVideoRef.current, canvas: canvasRef.current }, { referenceUrl: referenceSource });
      recorderEngineRef.current = engine;
      setStatus('Preparando câmera e referência...');
      await engine.prepare();
      setStep('countdown');
      for (let value = 4; value >= 1; value -= 1) { setCountdown(value); await sleep(1000); }
      setCountdown(0);
      await startReferenceMonitor();
      await engine.start();
      setStep('recording'); setStatus('Gravando agora. Cante junto com a referência e finalize quando terminar.');
    } catch (err) {
      setCountdown(0); await stopReferenceMonitor(); try { recorderEngineRef.current?.cleanup(); } catch {}; recorderEngineRef.current = null; setStep('intro'); setError(`Não consegui iniciar a gravação: ${errorText(err)}`);
    }
  }

  async function stopRecording() {
    setError(''); const engine = recorderEngineRef.current; if (!engine) return;
    try {
      const recording = await engine.stop(); recorderEngineRef.current = null; await stopReferenceMonitor(); setResult(recording); setStep('review'); setStatus('Gravação pronta. Ajuste a mixagem antes de publicar.');
    } catch (err) { await stopReferenceMonitor(); setStep('intro'); setError(`Não consegui finalizar a gravação: ${errorText(err)}`); }
  }

  async function ensurePreviewEngine() {
    if (!result?.canvasBlob || !result?.voiceBlob || !referenceSource) throw new Error('preview_missing_media');
    if (!previewVisualRef.current || !previewVoiceRef.current || !previewReferenceRef.current) throw new Error('preview_refs_missing');
    if (previewEngineRef.current) return previewEngineRef.current;
    const engine = new DuetPreviewEngine({ visual: previewVisualRef.current, voice: previewVoiceRef.current, reference: previewReferenceRef.current }, { visualBlob: result.canvasBlob, voiceBlob: result.voiceBlob, referenceUrl: referenceSource, initialFaders: { voice: voiceVolume, reference: referenceVolume }, preGains: { voice: 3.2, reference: 0.08 }, referenceOffsetMs });
    previewEngineRef.current = engine; await engine.prepare(); return engine;
  }

  async function playPreview() { setError(''); try { const engine = await ensurePreviewEngine(); engine.setReferenceOffsetMs(referenceOffsetMs); engine.setFaders({ voice: voiceVolume, reference: referenceVolume }); await engine.play(); setPlaying(true); setStatus('Ouvindo sua mixagem.'); } catch (err) { setPlaying(false); setError(`Não consegui iniciar o preview: ${errorText(err)}`); } }
  function pausePreview() { previewEngineRef.current?.pause(); setPlaying(false); }
  function setVoice(value: number) { setVoiceVolume(value); previewEngineRef.current?.setFaders({ voice: value }); }
  function setReference(value: number) { setReferenceVolume(value); previewEngineRef.current?.setFaders({ reference: value }); }
  function setReferenceOffset(value: number) { setReferenceOffsetMsState(value); previewEngineRef.current?.setReferenceOffsetMs(value); setStatus('Sincronia ajustada. Toque em ouvir mix para conferir do início.'); }
  function applyPreset(next: Preset) { setPreset(next); const config = presetInfo[next]; setVoice(config.voice); setReference(config.reference); setStatus(`${config.title} aplicado.`); }
  function autoMix() { applyPreset('studio'); previewEngineRef.current?.autoMix(); setStatus('Mixagem automática aplicada.'); }

  async function reset() { pausePreview(); await previewEngineRef.current?.close().catch(() => undefined); previewEngineRef.current = null; setResult(null); setError(''); setStatus(''); setPostedHref(''); setStep('intro'); setPostingProgress(0); setCountdown(0); setPlaying(false); }

  async function createServerRenderJob() {
    if (!result?.canvasBlob || !result?.voiceBlob || !referenceSource) return null;
    const data = new FormData();
    data.set('lesson_slug', lessonSlug);
    data.set('caption', caption || 'Minha prática do dueto.');
    data.set('visibility', postCommunity ? 'community' : 'private');
    data.set('review_requested', String(canSendForReview && sendForReview));
    data.set('voice_volume', String(voiceVolume));
    data.set('reference_volume', String(referenceVolume));
    data.set('reference_offset_ms', String(referenceOffsetMs));
    data.set('reference_url', referenceSource);
    data.set('video', new File([result.canvasBlob], `${lessonSlug}-visual.${(result.canvasBlob.type || '').includes('webm') ? 'webm' : 'mp4'}`, { type: result.canvasBlob.type || 'video/mp4' }));
    data.set('voice', new File([result.voiceBlob], `${lessonSlug}-voice.${(result.voiceBlob.type || '').includes('webm') ? 'webm' : 'm4a'}`, { type: result.voiceBlob.type || 'audio/mp4' }));

    setStatus('Preparando seu vídeo...'); setPostingProgress(22);
    const response = await fetch('/api/duet-render/jobs', { method: 'POST', body: data });
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      throw new Error(json?.detail || json?.message || 'Não consegui preparar o vídeo.');
    }
    const json = await response.json().catch(() => null);
    const jobId = String(json?.job_id || '');
    if (json?.status === 'completed' && json?.output_url) { setPostingProgress(88); return String(json.output_url); }
    if (!jobId) return null;

    for (let attempt = 1; attempt <= 18; attempt += 1) {
      setPostingProgress(Math.min(84, 28 + attempt * 3));
      await sleep(3000);
      const statusResponse = await fetch(`/api/duet-render/status/${jobId}`, { cache: 'no-store' });
      const statusJson = await statusResponse.json().catch(() => null);
      const job = statusJson?.job;
      if (job?.status === 'completed' && job.output_url) { setPostingProgress(88); return String(job.output_url); }
      if (job?.status === 'failed') throw new Error(job.error_message || 'Renderização no servidor falhou.');
    }
    console.info('[duet-render] server job queued but not completed yet', { jobId });
    return null;
  }

  async function saveRenderedUrl(fileUrl: string) {
    const visibility = postCommunity ? 'community' : 'private';
    const reviewRequested = canSendForReview && sendForReview;
    const response = await fetch('/api/submissions/duet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lesson_slug: lessonSlug, caption: caption || 'Minha prática do dueto.', visibility, review_requested: reviewRequested, file_url: fileUrl }),
    });
    if (!response.ok) { const json = await response.json().catch(() => null); throw new Error(json?.detail || json?.message || 'Não consegui salvar sua publicação.'); }
    return response.json().catch(() => null);
  }

  async function buildUploadBlob() {
    if (!result?.canvasBlob || !result?.voiceBlob || !referenceSource) throw new Error('missing_render_media');
    if (isSafariLike() && result.safePublishBlob && result.safePublishBlob.size > 1000) { setStatus('Finalizando envio...'); setPostingProgress(72); return result.safePublishBlob; }
    setStatus('Finalizando sua mixagem...'); setPostingProgress(56);
    const renderer = new DuetRendererEngine({ visualBlob: result.canvasBlob, voiceBlob: result.voiceBlob, referenceUrl: referenceSource, faders: { voice: voiceVolume, reference: referenceVolume }, referenceOffsetMs });
    const rendered = await renderer.renderVideo();
    if (!rendered.blob || rendered.blob.size < 1000) throw new Error(`render_empty:${rendered.blob?.size || 0}`);
    setPostingProgress(80);
    return rendered.blob;
  }

  async function submit() {
    if (!result?.canvasBlob) return setError('Grave o dueto antes de enviar.');
    const visibility = postCommunity ? 'community' : 'private'; const reviewRequested = canSendForReview && sendForReview;
    if (!postCommunity && !reviewRequested) return setError(canSendForReview ? 'Escolha postar na comunidade, enviar para avaliação ou os dois.' : 'No modo gratuito, poste na comunidade para continuar.');
    setStep('posting'); setError(''); setStatus('Enviando sua atividade...'); setPostingProgress(10); pausePreview();
    try {
      if (isSafariLike()) {
        const renderedUrl = await createServerRenderJob().catch((err) => { console.warn('[duet-render] queue failed; falling back', err); return null; });
        if (renderedUrl) {
          setStatus('Salvando publicação...'); setPostingProgress(92);
          const json = await saveRenderedUrl(renderedUrl);
          const communityPostId = String(json?.community_post_id || '');
          setPostedHref(postCommunity ? `/aluno/comunidade${communityPostId ? `#post-${communityPostId}` : ''}` : '');
          setPostingProgress(100); setStep('posted');
          return;
        }
      }
      const uploadBlob = await buildUploadBlob(); const fileType = uploadBlob.type || 'video/webm'; const data = new FormData();
      data.set('lesson_slug', lessonSlug); data.set('caption', caption || 'Minha prática do dueto.'); data.set('visibility', visibility); data.set('review_requested', String(reviewRequested)); data.set('voice_volume', String(voiceVolume)); data.set('reference_volume', String(referenceVolume)); data.set('voice_preset', preset); data.set('noise_reduction', 'false'); data.set('file', new File([uploadBlob], `${lessonSlug}-dueto-final.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) { const json = await response.json().catch(() => null); throw new Error(json?.detail || json?.message || 'Não consegui enviar sua atividade.'); }
      const json = await response.json().catch(() => null); const communityPostId = String(json?.community_post_id || ''); setPostedHref(postCommunity ? `/aluno/comunidade${communityPostId ? `#post-${communityPostId}` : ''}` : ''); setPostingProgress(100); setStep('posted');
    } catch (err) { setError(`Não consegui enviar sua atividade: ${errorText(err)}`); setStep('review'); setPostingProgress(0); }
  }

  const shell: React.CSSProperties = { minHeight: '100dvh', background: 'radial-gradient(circle at 50% 0%, rgba(245,199,107,.14), transparent 33%), linear-gradient(180deg,#050506,#09090b 54%,#030304)', color: '#fff', padding: '18px 16px 34px' };
  const wrap: React.CSSProperties = { maxWidth: 920, margin: '0 auto', display: 'grid', gap: 22 };
  const glass: React.CSSProperties = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 28, background: 'linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.035))', boxShadow: '0 24px 80px rgba(0,0,0,.38)', backdropFilter: 'blur(18px)' };
  const pill: React.CSSProperties = { border: 0, borderRadius: 999, padding: '14px 20px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', fontSize: 16 };
  const mutedPill: React.CSSProperties = { ...pill, background: 'rgba(255,255,255,.12)', color: '#fff' };
  const goldPill: React.CSSProperties = { ...pill, background: 'linear-gradient(135deg,#f8d47b,#f3bd49)', color: '#17120a' };
  const sectionTitle: React.CSSProperties = { color: '#f5c76b', letterSpacing: 3.5, fontSize: 13, fontWeight: 950, margin: 0, textTransform: 'uppercase' };
  const cardOption = (active: boolean): React.CSSProperties => ({ border: `1px solid ${active ? 'rgba(245,199,107,.7)' : 'rgba(255,255,255,.12)'}`, borderRadius: 20, padding: 14, background: active ? 'linear-gradient(180deg,rgba(245,199,107,.16),rgba(245,199,107,.06))' : 'rgba(255,255,255,.045)', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' });
  const presetCard = (active: boolean): React.CSSProperties => ({ border: `1px solid ${active ? 'rgba(245,199,107,.75)' : 'rgba(255,255,255,.12)'}`, borderRadius: 20, padding: 16, minHeight: 74, textAlign: 'left', background: active ? 'linear-gradient(180deg,rgba(245,199,107,.18),rgba(245,199,107,.07))' : 'rgba(255,255,255,.04)', color: '#fff', cursor: 'pointer' });

  return <main style={shell}><section style={wrap}>
    <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}><a href={`/aluno/aula/${lessonSlug}`} style={{ color: '#fff', textDecoration: 'none', fontWeight: 850 }}>← Voltar para a aula</a>{step === 'recording' ? <button onClick={stopRecording} style={{ border: 0, background: 'transparent', color: '#f5c76b', fontWeight: 950, fontSize: 15 }}>Finalizar gravação</button> : step === 'review' ? <button onClick={submit} style={{ border: 0, background: 'transparent', color: '#f5c76b', fontWeight: 950, fontSize: 15 }}>Publicar</button> : null}</nav>

    <header style={{ ...glass, padding: 26, display: 'grid', gap: 18, position: 'relative', overflow: 'hidden', minHeight: 220 }}><div style={{ position: 'absolute', right: -12, top: 0, bottom: 0, width: '46%', background: 'radial-gradient(circle at 60% 38%,rgba(245,199,107,.24),transparent 35%)', opacity: .95 }} /><img src="/imagem/mic.png" alt="" style={{ position: 'absolute', right: 14, bottom: -6, width: '34%', maxWidth: 210, minWidth: 130, opacity: .95, objectFit: 'contain', filter: 'drop-shadow(0 20px 42px rgba(245,199,107,.24))' }} /><div style={{ position: 'relative' }}><p style={sectionTitle}>Atividade prática</p><h1 style={{ margin: '22px 0 10px', fontSize: 'clamp(38px,8vw,60px)', lineHeight: .92, letterSpacing: -2.2, fontFamily: 'Georgia, serif' }}>Grave seu dueto</h1><p style={{ margin: 0, color: 'rgba(255,255,255,.72)', fontSize: 18 }}>Aula: {lessonTitle}</p></div><div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, maxWidth: 620 }}><div style={{ border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 14, background: 'rgba(255,255,255,.045)', display: 'flex', gap: 12, alignItems: 'center' }}><Headphones color="#f5c76b" /><span><strong>Use fone de ouvido</strong><br /><small style={{ color: 'rgba(255,255,255,.62)' }}>Melhor captação da voz.</small></span></div><div style={{ border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 14, background: 'rgba(255,255,255,.045)', display: 'flex', gap: 12, alignItems: 'center' }}><Crown color="#f5c76b" /><span><strong>{canSendForReview ? 'Modo VIP' : 'Modo gratuito'}</strong><br /><small style={{ color: 'rgba(255,255,255,.62)' }}>Grave e publique na comunidade.</small></span></div></div></header>

    {error ? <div style={{ ...glass, padding: 16, borderColor: 'rgba(255,80,80,.45)', color: '#ffb4b4' }}>{error}</div> : null}
    {status && step !== 'posting' && step !== 'countdown' ? <div style={{ ...glass, padding: 16, color: '#f5c76b', whiteSpace: 'pre-wrap' }}>{status}</div> : null}

    <p style={sectionTitle}>Sua tela de gravação</p>
    <section style={{ ...glass, overflow: 'hidden', padding: 0, borderColor: 'rgba(245,199,107,.45)' }}><div style={{ position: 'relative', aspectRatio: '16/9', minHeight: 260, background: '#000', display: 'grid', placeItems: 'center' }}><video ref={referenceVideoRef} playsInline muted style={{ display: 'none' }} /><video ref={cameraRef} playsInline muted autoPlay style={{ display: 'none' }} /><audio ref={previewVoiceRef} preload="auto" style={{ display: 'none' }} /><audio ref={previewReferenceRef} preload="auto" style={{ display: 'none' }} />{result?.canvasBlob && step !== 'recording' && step !== 'countdown' ? <video ref={previewVisualRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} onEnded={pausePreview} /> : <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}{step === 'intro' ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, background: 'radial-gradient(circle,rgba(0,0,0,.18),rgba(0,0,0,.55))' }}><div style={{ display: 'grid', placeItems: 'center', gap: 12, color: 'rgba(255,255,255,.68)' }}><Video size={42} /><span>O vídeo do seu dueto<br />aparecerá aqui</span></div></div> : null}{step === 'countdown' ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.72)' }}><div style={{ textAlign: 'center' }}><div style={{ width: 130, height: 130, borderRadius: 999, display: 'grid', placeItems: 'center', border: '2px solid rgba(245,199,107,.65)', color: '#f5c76b', fontSize: 62, fontWeight: 950, boxShadow: '0 0 44px rgba(245,199,107,.18)' }}>{countdown}</div><p style={{ margin: '14px 0 0', fontWeight: 800 }}>Prepare-se</p></div></div> : null}{step === 'recording' ? <div style={{ position: 'absolute', top: 14, left: 14, background: '#e11d48', borderRadius: 999, padding: '8px 13px', fontWeight: 950, boxShadow: '0 0 24px rgba(225,29,72,.5)' }}>● Gravando</div> : null}</div></section>

    {step === 'intro' || step === 'recording' || step === 'countdown' ? <><p style={sectionTitle}>Controles da gravação</p><section style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}><div style={{ ...glass, padding: 14 }}><Mic color="#f5c76b" /><strong style={{ display: 'block', marginTop: 10 }}>Câmera</strong><small style={{ color: 'rgba(255,255,255,.62)' }}>Frontal</small></div><div style={{ ...glass, padding: 14 }}><Video color="#f5c76b" /><strong style={{ display: 'block', marginTop: 10 }}>Qualidade</strong><small style={{ color: 'rgba(255,255,255,.62)' }}>1080p</small></div><div style={{ ...glass, padding: 14 }}><Mic color="#f5c76b" /><strong style={{ display: 'block', marginTop: 10 }}>Áudio</strong><small style={{ color: 'rgba(255,255,255,.62)' }}>Microfone</small></div><div style={{ ...glass, padding: 14 }}><Headphones color="#f5c76b" /><strong style={{ display: 'block', marginTop: 10 }}>Dicas</strong><small style={{ color: 'rgba(255,255,255,.62)' }}>Use fone</small></div></section><section style={{ ...glass, padding: 18, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 18 }}><button style={{ ...mutedPill, justifySelf: 'center' }} type="button" onClick={startReferenceMonitor}><Play size={18} /> Ouvir base</button>{step === 'recording' ? <button style={{ ...pill, width: 96, height: 96, borderRadius: 999, background: '#e11d48', color: '#fff', justifySelf: 'center', padding: 0 }} onClick={stopRecording}><Square size={30} /></button> : <button style={{ ...pill, width: 96, height: 96, borderRadius: 999, background: 'linear-gradient(135deg,#f8d47b,#f3bd49)', color: '#17120a', justifySelf: 'center', padding: 0 }} onClick={startRecording} disabled={step === 'countdown'}><Video size={34} /></button>}<button style={{ ...mutedPill, justifySelf: 'center' }} type="button"><RotateCcw size={18} /> Virar câmera</button></section></> : null}

    {step === 'posting' ? <section style={{ ...glass, padding: 22, display: 'grid', gap: 14 }}><strong style={{ fontSize: 22 }}>Publicando seu dueto</strong><p style={{ margin: 0, color: 'rgba(255,255,255,.62)' }}>{status || 'Preparando sua publicação...'}</p><div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,.10)', overflow: 'hidden' }}><div style={{ width: `${Math.max(8, postingProgress)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#f8d47b,#f3bd49)', transition: 'width .45s ease' }} /></div><small style={{ color: 'rgba(255,255,255,.48)' }}>Mantenha esta tela aberta até concluir.</small></section> : null}

    {step === 'review' ? <section style={{ ...glass, padding: 18, display: 'grid', gap: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><p style={sectionTitle}>Editor ao vivo</p><h2 style={{ margin: '8px 0 0', fontSize: 28 }}>Volume e efeito</h2></div><button type="button" onClick={autoMix} style={{ border: 0, background: 'transparent', color: '#f5c76b', fontWeight: 950 }}>Reset</button></div><button type="button" onClick={autoMix} style={{ border: '1px solid rgba(245,199,107,.45)', borderRadius: 20, padding: 16, textAlign: 'left', background: 'linear-gradient(180deg,rgba(245,199,107,.17),rgba(245,199,107,.06))', color: '#fff' }}><strong>✨ Melhorar automaticamente</strong><br /><small style={{ color: 'rgba(255,255,255,.66)' }}>Normaliza o ganho das faixas e deixa os volumes prontos.</small></button><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>🎙️ Voz</span><span style={{ color: '#f5c76b' }}>{voiceVolume}%</span></span><input type="range" min="0" max="200" value={voiceVolume} onChange={(event) => setVoice(Number(event.target.value))} /></label><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>♪ Referência</span><span style={{ color: '#f5c76b' }}>{referenceVolume}%</span></span><input type="range" min="0" max="200" value={referenceVolume} onChange={(event) => setReference(Number(event.target.value))} /></label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>{(Object.keys(presetInfo) as Preset[]).map((key) => <button key={key} type="button" onClick={() => applyPreset(key)} style={presetCard(preset === key)}><strong style={{ fontSize: 21 }}>{presetInfo[key].title}</strong><br /><small style={{ color: 'rgba(255,255,255,.58)' }}>{presetInfo[key].text}</small></button>)}</div><details><summary style={{ cursor: 'pointer', color: '#f5c76b', fontWeight: 900 }}>Ajustar sincronia</summary><label style={{ display: 'grid', gap: 8, marginTop: 12 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Sincronia</span><span>{referenceOffsetMs > 0 ? `+${referenceOffsetMs}` : referenceOffsetMs}ms</span></span><input type="range" min="-300" max="300" step="10" value={referenceOffsetMs} onChange={(event) => setReferenceOffset(Number(event.target.value))} /></label></details><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button style={mutedPill} onClick={reset}><RefreshCcw size={18} /> Regravar</button><button style={goldPill} onClick={playing ? pausePreview : playPreview}>{playing ? <Pause size={18} /> : <Play size={18} />}{playing ? 'Pausar mix' : 'Ouvir mix'}</button></div></section> : null}

    {step === 'review' ? <section style={{ ...glass, padding: 18, display: 'grid', gap: 14 }}><h2 style={{ margin: 0, fontSize: 24 }}>Publicação</h2><div style={{ display: 'grid', gap: 10 }}><button type="button" onClick={() => setPostCommunity(!postCommunity)} style={cardOption(postCommunity)}><span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: postCommunity ? '#0ea5e9' : 'rgba(255,255,255,.10)', color: '#fff', flex: '0 0 auto' }}>{postCommunity ? '✓' : ''}</span><span style={{ textAlign: 'left' }}><strong>Postar na comunidade</strong><br /><small style={{ color: 'rgba(255,255,255,.58)' }}>Compartilhe seu dueto com os alunos.</small></span></button><button type="button" disabled={!canSendForReview} onClick={() => canSendForReview && setSendForReview(!sendForReview)} style={{ ...cardOption(sendForReview && canSendForReview), opacity: canSendForReview ? 1 : .58 }}><span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: sendForReview && canSendForReview ? '#0ea5e9' : 'rgba(255,255,255,.10)', color: '#fff', flex: '0 0 auto' }}>{sendForReview && canSendForReview ? '✓' : ''}</span><span style={{ textAlign: 'left' }}><strong>Enviar para avaliação</strong><br /><small style={{ color: 'rgba(255,255,255,.58)' }}>Receba orientação do professor.</small></span></button></div><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda..." style={{ width: '100%', minHeight: 108, borderRadius: 18, padding: 14, background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.12)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} /><button onClick={submit} style={{ ...goldPill, width: '100%' }}><Send size={19} /> Publicar dueto</button></section> : null}

    {step === 'posted' ? <section style={{ ...glass, padding: 22, display: 'grid', gap: 12, placeItems: 'start' }}><CheckCircle2 color="#86efac" size={36} /><h2 style={{ margin: 0 }}>Vídeo enviado</h2><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{postedHref ? <a style={{ ...goldPill, textDecoration: 'none' }} href={postedHref}>Ver postagem</a> : null}<a style={{ ...mutedPill, textDecoration: 'none' }} href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
  </section></main>;
}
