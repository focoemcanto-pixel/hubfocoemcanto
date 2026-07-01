'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CheckCircle2, Headphones, Mic, Music2, Pause, Play, RefreshCcw, Send, SlidersHorizontal, Square, Video } from 'lucide-react';
import { proxiedVideoUrl } from '@/lib/audio/duet-recording-utils';
import { DuetPreviewEngine } from '@/lib/audio-engine/duet-preview-engine';
import { DuetRecorderEngine, type DuetRecorderEngineResult } from '@/lib/audio-engine/duet-recorder-engine';
import { DuetRendererEngine } from '@/lib/audio-engine/duet-renderer-engine';

type Props = { lessonTitle: string; lessonSlug: string; referenceUrl?: string | null; referenceEmbedUrl?: string | null; canSendForReview?: boolean };
type Step = 'intro' | 'countdown' | 'recording' | 'review' | 'posting' | 'posted';
type Preset = 'natural' | 'studio' | 'worship' | 'coral';
type AudioDevice = { deviceId: string; label: string };

function isSafariLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}
function errorText(error: unknown) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error || 'erro_desconhecido'); }
function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

const presets: Record<Preset, { title: string; text: string; voice: number; reference: number }> = {
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
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [showMicChoices, setShowMicChoices] = useState(false);

  useEffect(() => () => {
    try { recorderEngineRef.current?.cleanup(); } catch {}
    previewEngineRef.current?.close().catch(() => undefined);
  }, []);

  async function mapAudioDevices() {
    setError('');
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => undefined);
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput').map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Microfone ${index + 1}` }));
      setAudioDevices(inputs);
      setShowMicChoices(true);
      if (!selectedAudioDeviceId && inputs[0]) setSelectedAudioDeviceId(inputs[0].deviceId);
    } catch (err) {
      setError(`Não consegui mapear os microfones: ${errorText(err)}`);
    }
  }

  async function startRecording() {
    setError(''); setStatus(''); setPostedHref(''); setResult(null); setPostingProgress(0); setPlaying(false); setShowMicChoices(false);
    if (!referenceSource) return setError('Essa atividade ainda não tem vídeo de referência vinculado.');
    if (!cameraRef.current || !referenceVideoRef.current || !canvasRef.current) return setError('Elementos de gravação indisponíveis.');
    try {
      await previewEngineRef.current?.close().catch(() => undefined);
      previewEngineRef.current = null;
      const engine = new DuetRecorderEngine(
        { camera: cameraRef.current, referenceVideo: referenceVideoRef.current, canvas: canvasRef.current },
        { referenceUrl: referenceSource, audioDeviceId: selectedAudioDeviceId || null, facingMode }
      );
      recorderEngineRef.current = engine;
      setStatus('Preparando câmera e referência...');
      await engine.prepare();
      setStep('countdown');
      for (let value = 4; value >= 1; value -= 1) {
        setCountdown(value);
        await sleep(1000);
      }
      setCountdown(0);
      await engine.start();
      setStep('recording');
      setStatus('Gravando agora. Cante junto com a referência e finalize quando terminar.');
    } catch (err) {
      setCountdown(0);
      try { recorderEngineRef.current?.cleanup(); } catch {}
      recorderEngineRef.current = null;
      setStep('intro');
      setError(`Não consegui iniciar a gravação: ${errorText(err)}`);
    }
  }

  async function stopRecording() {
    setError('');
    const engine = recorderEngineRef.current;
    if (!engine) return;
    try {
      const recording = await engine.stop();
      recorderEngineRef.current = null;
      setResult(recording);
      setStep('review');
      setStatus('Gravação pronta. Ajuste a mixagem antes de enviar.');
    } catch (err) {
      setStep('intro');
      setError(`Não consegui finalizar a gravação: ${errorText(err)}`);
    }
  }

  async function ensurePreviewEngine() {
    if (!result?.canvasBlob || !result?.voiceBlob || !referenceSource) throw new Error('preview_missing_media');
    if (!previewVisualRef.current || !previewVoiceRef.current || !previewReferenceRef.current) throw new Error('preview_refs_missing');
    if (previewEngineRef.current) return previewEngineRef.current;
    const engine = new DuetPreviewEngine(
      { visual: previewVisualRef.current, voice: previewVoiceRef.current, reference: previewReferenceRef.current },
      { visualBlob: result.canvasBlob, voiceBlob: result.voiceBlob, referenceUrl: referenceSource, initialFaders: { voice: voiceVolume, reference: referenceVolume }, preGains: { voice: 3.2, reference: 0.08 }, referenceOffsetMs }
    );
    previewEngineRef.current = engine;
    await engine.prepare();
    return engine;
  }

  async function playPreview() { setError(''); try { const engine = await ensurePreviewEngine(); engine.setReferenceOffsetMs(referenceOffsetMs); engine.setFaders({ voice: voiceVolume, reference: referenceVolume }); await engine.play(); setPlaying(true); setStatus('Ouvindo sua mixagem.'); } catch (err) { setPlaying(false); setError(`Não consegui iniciar o preview: ${errorText(err)}`); } }
  function pausePreview() { previewEngineRef.current?.pause(); setPlaying(false); }
  function setVoice(value: number) { setVoiceVolume(value); previewEngineRef.current?.setFaders({ voice: value }); }
  function setReference(value: number) { setReferenceVolume(value); previewEngineRef.current?.setFaders({ reference: value }); }
  function setReferenceOffset(value: number) { setReferenceOffsetMsState(value); previewEngineRef.current?.setReferenceOffsetMs(value); setStatus('Sincronia ajustada. Toque em ouvir mix para conferir do início.'); }
  function applyPreset(key: Preset) { setPreset(key); setVoice(presets[key].voice); setReference(presets[key].reference); }
  function autoMix() { setVoiceVolume(110); setReferenceVolume(70); previewEngineRef.current?.autoMix(); setStatus('Auto Mix aplicado.'); }
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
    if (!response.ok) { const json = await response.json().catch(() => null); throw new Error(json?.detail || json?.message || 'Não consegui preparar o vídeo.'); }
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
    return null;
  }

  async function saveRenderedUrl(fileUrl: string) {
    const visibility = postCommunity ? 'community' : 'private';
    const reviewRequested = canSendForReview && sendForReview;
    const response = await fetch('/api/submissions/duet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lesson_slug: lessonSlug, caption: caption || 'Minha prática do dueto.', visibility, review_requested: reviewRequested, file_url: fileUrl }) });
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
    const visibility = postCommunity ? 'community' : 'private';
    const reviewRequested = canSendForReview && sendForReview;
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
      const uploadBlob = await buildUploadBlob();
      const fileType = uploadBlob.type || 'video/webm';
      const data = new FormData();
      data.set('lesson_slug', lessonSlug); data.set('caption', caption || 'Minha prática do dueto.'); data.set('visibility', visibility); data.set('review_requested', String(reviewRequested)); data.set('voice_volume', String(voiceVolume)); data.set('reference_volume', String(referenceVolume)); data.set('voice_preset', preset); data.set('noise_reduction', 'false'); data.set('file', new File([uploadBlob], `${lessonSlug}-dueto-final.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) { const json = await response.json().catch(() => null); throw new Error(json?.detail || json?.message || 'Não consegui enviar sua atividade.'); }
      const json = await response.json().catch(() => null);
      const communityPostId = String(json?.community_post_id || '');
      setPostedHref(postCommunity ? `/aluno/comunidade${communityPostId ? `#post-${communityPostId}` : ''}` : '');
      setPostingProgress(100); setStep('posted');
    } catch (err) {
      setError(`Não consegui enviar sua atividade: ${errorText(err)}`); setStep('review'); setPostingProgress(0);
    }
  }

  const isPre = step === 'intro' || step === 'countdown';
  const shell: CSSProperties = { minHeight: '100dvh', background: 'radial-gradient(circle at 50% 0%, rgba(245,199,107,.18), transparent 34%), linear-gradient(180deg,#050506,#09090b 54%,#030304)', color: '#fff', padding: '18px 16px 34px' };
  const wrap: CSSProperties = { maxWidth: 920, margin: '0 auto', display: 'grid', gap: 18 };
  const glass: CSSProperties = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 28, background: 'linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.035))', boxShadow: '0 24px 80px rgba(0,0,0,.38)', backdropFilter: 'blur(18px)' };
  const pill: CSSProperties = { border: 0, borderRadius: 999, padding: '14px 20px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', fontSize: 16 };
  const mutedPill: CSSProperties = { ...pill, background: 'rgba(255,255,255,.12)', color: '#fff' };
  const goldPill: CSSProperties = { ...pill, background: 'linear-gradient(135deg,#f8d47b,#f3bd49)', color: '#17120a' };
  const cardOption = (active: boolean): CSSProperties => ({ border: `1px solid ${active ? 'rgba(245,199,107,.7)' : 'rgba(255,255,255,.12)'}`, borderRadius: 18, padding: 14, background: active ? 'linear-gradient(180deg,rgba(245,199,107,.16),rgba(245,199,107,.06))' : 'rgba(255,255,255,.045)', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', color: '#fff' });
  const label: CSSProperties = { color: '#f5c76b', letterSpacing: 3, fontSize: 12, fontWeight: 950, textTransform: 'uppercase' };
  const selectedMicLabel = audioDevices.find((device) => device.deviceId === selectedAudioDeviceId)?.label || 'Entrada padrão';

  return <main style={shell}><section style={wrap}>
    <header style={{ ...glass, padding: 22, display: 'grid', gap: 10, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: 10, bottom: -32, width: 170, height: 170, borderRadius: 999, background: 'radial-gradient(circle,rgba(245,199,107,.18),transparent 68%)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, position: 'relative' }}><span style={{ color: '#f5c76b', letterSpacing: 2, fontWeight: 950, fontSize: 13 }}>DUETO PREMIUM</span><span style={{ opacity: .7, fontSize: 13 }}>{step === 'recording' ? 'Gravando agora' : step === 'review' ? 'Mixagem' : step === 'countdown' ? 'Preparando' : 'Treino guiado'}</span></div>
      <h1 style={{ margin: 0, fontSize: 'clamp(34px,8vw,56px)', lineHeight: .95, letterSpacing: -1.8, position: 'relative' }}>Grave seu dueto</h1>
      <p style={{ margin: 0, color: 'rgba(255,255,255,.68)', fontSize: 17, position: 'relative' }}>Aula: {lessonTitle}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, position: 'relative' }}><span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', color: '#f6d28a', fontWeight: 800, fontSize: 13 }}><Headphones size={16} /> Use fone para melhor resultado</span><span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', color: 'rgba(255,255,255,.62)', fontWeight: 700, fontSize: 13 }}><Music2 size={16} /> Mixagem em tempo real</span></div>
    </header>

    {error ? <div style={{ ...glass, padding: 16, borderColor: 'rgba(255,80,80,.45)', color: '#ffb4b4' }}>{error}</div> : null}
    {status && step !== 'posting' && !isPre ? <div style={{ ...glass, padding: 16, color: '#f5c76b', whiteSpace: 'pre-wrap' }}>{status}</div> : null}

    {isPre ? <section style={{ ...glass, padding: 16, display: 'grid', gap: 12 }}><p style={{ ...label, margin: 0 }}>Preparação</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}><button type="button" onClick={() => setFacingMode((mode) => mode === 'user' ? 'environment' : 'user')} style={{ ...cardOption(false), textAlign: 'left' }}><Video size={21} color="#f5c76b" /><span><strong>Câmera</strong><br/><small style={{ color: 'rgba(255,255,255,.58)' }}>{facingMode === 'user' ? 'Frontal' : 'Traseira'} • tocar para virar</small></span></button><button type="button" onClick={mapAudioDevices} style={{ ...cardOption(showMicChoices), textAlign: 'left' }}><Mic size={21} color="#f5c76b" /><span><strong>Microfone</strong><br/><small style={{ color: 'rgba(255,255,255,.58)' }}>{selectedMicLabel}</small></span></button></div>{showMicChoices ? <div style={{ display: 'grid', gap: 8 }}>{audioDevices.length ? audioDevices.map((device) => <button key={device.deviceId} type="button" onClick={() => { setSelectedAudioDeviceId(device.deviceId); setShowMicChoices(false); }} style={{ ...cardOption(device.deviceId === selectedAudioDeviceId), justifyContent: 'space-between', textAlign: 'left' }}><span>{device.label}</span><span>{device.deviceId === selectedAudioDeviceId ? '✓' : ''}</span></button>) : <small style={{ color: 'rgba(255,255,255,.6)' }}>Nenhum microfone listado pelo navegador.</small>}</div> : null}</section> : null}

    <section style={{ ...glass, overflow: 'hidden', padding: 0, borderColor: isPre ? 'rgba(245,199,107,.32)' : 'rgba(255,255,255,.12)' }}><div style={{ position: 'relative', aspectRatio: isPre ? '16/10' : '16/9', minHeight: isPre ? 250 : undefined, background: '#000', display: 'grid', placeItems: 'center' }}><video ref={referenceVideoRef} playsInline muted style={{ display: 'none' }} /><video ref={cameraRef} playsInline muted autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: step === 'countdown' ? 'block' : 'none' }} /><audio ref={previewVoiceRef} preload="auto" style={{ display: 'none' }} /><audio ref={previewReferenceRef} preload="auto" style={{ display: 'none' }} />{result?.canvasBlob && step !== 'recording' && step !== 'countdown' ? <video ref={previewVisualRef} playsInline muted poster={result.posterDataUrl || undefined} style={{ width: '100%', height: '100%', objectFit: 'contain', background: result.posterDataUrl ? `center / contain no-repeat url(${result.posterDataUrl})` : '#000' }} onEnded={pausePreview} /> : <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'cover', display: step === 'countdown' ? 'none' : 'block' }} />}{step === 'intro' ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, background: 'radial-gradient(circle,rgba(0,0,0,.18),rgba(0,0,0,.55))' }}><div style={{ display: 'grid', placeItems: 'center', gap: 12 }}><span style={{ width: 78, height: 78, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(245,199,107,.16)', border: '1px solid rgba(245,199,107,.45)', color: '#f5c76b' }}><Video size={34} /></span><strong style={{ fontSize: 18 }}>Toque para iniciar câmera e referência</strong><small style={{ color: 'rgba(255,255,255,.62)' }}>A contagem aparece aqui antes de gravar.</small></div></div> : null}{step === 'countdown' ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.62))' }}><div style={{ textAlign: 'center' }}><small style={{ color: 'rgba(255,255,255,.76)', fontWeight: 900 }}>A gravação começa em</small><div style={{ width: 118, height: 118, borderRadius: 999, border: '2px solid rgba(245,199,107,.72)', display: 'grid', placeItems: 'center', color: '#f5c76b', fontSize: 58, fontWeight: 950, margin: '12px auto', boxShadow: '0 0 40px rgba(245,199,107,.22)' }}>{countdown}</div><strong>Prepare-se</strong></div></div> : null}{step === 'recording' ? <div style={{ position: 'absolute', top: 14, left: 14, background: '#e11d48', borderRadius: 999, padding: '8px 13px', fontWeight: 950, boxShadow: '0 0 24px rgba(225,29,72,.5)' }}>● Gravando</div> : null}{step === 'review' ? <button type="button" onClick={playing ? pausePreview : playPreview} style={{ position: 'absolute', inset: 0, margin: 'auto', width: 86, height: 86, borderRadius: 999, border: '1px solid rgba(245,199,107,.45)', background: 'rgba(0,0,0,.5)', color: '#f5c76b', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>{playing ? <Pause size={36} /> : <Play size={36} />}</button> : null}</div></section>

    {isPre ? <section style={{ ...glass, padding: 16, display: 'grid', gap: 12 }}><p style={{ ...label, margin: 0 }}>Orientações rápidas</p><div style={{ display: 'grid', gap: 10 }}><div style={{ display: 'flex', gap: 10, alignItems: 'start' }}><Headphones size={19} color="#f5c76b" /><span><strong>Use fone de ouvido.</strong><br/><small style={{ color: 'rgba(255,255,255,.58)' }}>Isso evita que a referência vaze no microfone.</small></span></div><div style={{ display: 'flex', gap: 10, alignItems: 'start' }}><span style={{ color: '#f5c76b', fontWeight: 950 }}>!</span><span><strong>Bluetooth pode gerar atraso.</strong><br/><small style={{ color: 'rgba(255,255,255,.58)' }}>Para mais precisão, prefira fone com fio.</small></span></div></div></section> : null}

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>{isPre ? <button style={{ ...goldPill, gridColumn: '1 / -1', minHeight: 62 }} onClick={startRecording} disabled={step === 'countdown'}><Mic size={20} /> {step === 'countdown' ? 'Preparando...' : 'Iniciar gravação'}</button> : null}{step === 'recording' ? <button style={{ ...pill, gridColumn: '1 / -1', background: '#e11d48', color: '#fff' }} onClick={stopRecording}><Square size={20} /> Finalizar gravação</button> : null}{step === 'review' ? <><button style={mutedPill} onClick={reset}><RefreshCcw size={19} /> Regravar</button><button style={goldPill} onClick={playing ? pausePreview : playPreview}>{playing ? <Pause size={18} /> : <Play size={18} />}{playing ? 'Pausar' : 'Ouvir gravação'}</button></> : null}</section>

    {step === 'posting' ? <section style={{ ...glass, padding: 22, display: 'grid', gap: 14 }}><strong style={{ fontSize: 22 }}>Publicando seu dueto</strong><p style={{ margin: 0, color: 'rgba(255,255,255,.62)' }}>{status || 'Preparando sua publicação...'}</p><div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,.10)', overflow: 'hidden' }}><div style={{ width: `${Math.max(8, postingProgress)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#f8d47b,#f3bd49)', transition: 'width .45s ease' }} /></div><small style={{ color: 'rgba(255,255,255,.48)' }}>Mantenha esta tela aberta até concluir.</small></section> : null}

    {step === 'review' ? <section style={{ ...glass, padding: 18, display: 'grid', gap: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><h2 style={{ margin: 0, fontSize: 24 }}>Mixagem</h2><p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.62)' }}>Ajuste sua voz e a referência antes de publicar.</p></div><SlidersHorizontal color="#f5c76b" /></div><button style={{ ...cardOption(true), width: '100%' }} onClick={autoMix}>✨ Melhorar automaticamente</button><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Minha voz</span><span>{voiceVolume}%</span></span><input type="range" min="0" max="200" value={voiceVolume} onChange={(event) => setVoice(Number(event.target.value))} /></label><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Referência</span><span>{referenceVolume}%</span></span><input type="range" min="0" max="200" value={referenceVolume} onChange={(event) => setReference(Number(event.target.value))} /></label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>{(Object.keys(presets) as Preset[]).map((key) => <button key={key} type="button" onClick={() => applyPreset(key)} style={{ ...cardOption(preset === key), textAlign: 'left', minHeight: 76 }}><span><strong>{presets[key].title}</strong><br/><small style={{ color: 'rgba(255,255,255,.58)' }}>{presets[key].text}</small></span></button>)}</div><details><summary style={{ cursor: 'pointer', color: '#f5c76b', fontWeight: 900 }}>Ajustar sincronia</summary><label style={{ display: 'grid', gap: 8, marginTop: 12 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Sincronia</span><span>{referenceOffsetMs > 0 ? `+${referenceOffsetMs}` : referenceOffsetMs}ms</span></span><input type="range" min="-300" max="300" step="10" value={referenceOffsetMs} onChange={(event) => setReferenceOffset(Number(event.target.value))} /></label></details></section> : null}

    {step === 'review' ? <section style={{ ...glass, padding: 18, display: 'grid', gap: 14 }}><h2 style={{ margin: 0, fontSize: 24 }}>Publicação</h2><div style={{ display: 'grid', gap: 10 }}><button type="button" onClick={() => setPostCommunity(!postCommunity)} style={cardOption(postCommunity)}><span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: postCommunity ? '#0ea5e9' : 'rgba(255,255,255,.10)', color: '#fff', flex: '0 0 auto' }}>{postCommunity ? '✓' : ''}</span><span style={{ textAlign: 'left' }}><strong>Postar na comunidade</strong><br /><small style={{ color: 'rgba(255,255,255,.58)' }}>Compartilhe seu dueto com os alunos.</small></span></button><button type="button" disabled={!canSendForReview} onClick={() => canSendForReview && setSendForReview(!sendForReview)} style={{ ...cardOption(sendForReview && canSendForReview), opacity: canSendForReview ? 1 : .58 }}><span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: sendForReview && canSendForReview ? '#0ea5e9' : 'rgba(255,255,255,.10)', color: '#fff', flex: '0 0 auto' }}>{sendForReview && canSendForReview ? '✓' : ''}</span><span style={{ textAlign: 'left' }}><strong>Enviar para avaliação</strong><br /><small style={{ color: 'rgba(255,255,255,.58)' }}>Receba orientação do professor.</small></span></button></div><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda..." style={{ width: '100%', minHeight: 108, borderRadius: 18, padding: 14, background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.12)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} /><button onClick={submit} style={{ ...goldPill, width: '100%' }}><Send size={19} /> Publicar dueto</button></section> : null}

    {step === 'posted' ? <section style={{ ...glass, padding: 22, display: 'grid', gap: 12, placeItems: 'start' }}><CheckCircle2 color="#86efac" size={36} /><h2 style={{ margin: 0 }}>Vídeo enviado</h2><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{postedHref ? <a style={{ ...goldPill, textDecoration: 'none' }} href={postedHref}>Ver postagem</a> : null}<a style={{ ...mutedPill, textDecoration: 'none' }} href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
  </section></main>;
}
