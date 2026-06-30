'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Headphones, Mic, Music2, Pause, Play, RefreshCcw, Send, SlidersHorizontal, Square, Video } from 'lucide-react';
import { proxiedVideoUrl } from '@/lib/audio/duet-recording-utils';
import { DuetAudioEngine } from '@/lib/audio-engine/duet-audio-engine';
import { DuetPreviewEngine } from '@/lib/audio-engine/duet-preview-engine';
import { DuetRecorderEngine, type DuetRecorderEngineResult } from '@/lib/audio-engine/duet-recorder-engine';
import { DuetRendererEngine } from '@/lib/audio-engine/duet-renderer-engine';
import { attachMediaSource } from '@/lib/media/hls-client';

type Props = { lessonTitle: string; lessonSlug: string; referenceUrl?: string | null; referenceEmbedUrl?: string | null; canSendForReview?: boolean };
type Step = 'intro' | 'recording' | 'review' | 'posting' | 'posted';

function errorText(error: unknown) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error || 'erro_desconhecido'); }
function formatSize(blob?: Blob | null) { return blob?.size ? `${Math.round(blob.size / 1024)} KB` : 'vazio'; }
function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function waitMediaReady(media: HTMLMediaElement, timeoutMs = 12000) {
  return new Promise<void>((resolve, reject) => {
    if (media.readyState >= 2) return resolve();
    let done = false;
    const cleanup = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      media.removeEventListener('loadedmetadata', ok);
      media.removeEventListener('loadeddata', ok);
      media.removeEventListener('canplay', ok);
      media.removeEventListener('error', fail);
      fn();
    };
    const ok = () => cleanup(resolve);
    const fail = () => cleanup(() => reject(new Error('media_load_failed')));
    const timer = window.setTimeout(() => cleanup(() => reject(new Error('media_load_timeout'))), timeoutMs);
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('loadeddata', ok, { once: true });
    media.addEventListener('canplay', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
}

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
  const [diagnostic, setDiagnostic] = useState('');
  const [voiceVolume, setVoiceVolume] = useState(110);
  const [referenceVolume, setReferenceVolume] = useState(70);
  const [referenceOffsetMs, setReferenceOffsetMsState] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => {
    try { recorderEngineRef.current?.cleanup(); } catch {}
    previewEngineRef.current?.close().catch(() => undefined);
    stopReferenceMonitor().catch(() => undefined);
  }, []);

  async function startReferenceMonitor() {
    if (!referenceSource) return;
    await stopReferenceMonitor();
    const media = document.createElement('video');
    media.preload = 'auto';
    media.playsInline = true;
    media.volume = 0;
    media.muted = false;
    monitorMediaRef.current = media;
    monitorAttachmentRef.current = await attachMediaSource(media, referenceSource);
    await waitMediaReady(media);
    const engine = new DuetAudioEngine({ latencyHint: 'interactive', sampleRate: 48000 });
    engine.setPreGains({ reference: 0.35, voice: 0 });
    engine.setFaders({ reference: 100, voice: 0 });
    engine.connectReferenceElement(media);
    monitorEngineRef.current = engine;
    await engine.resume();
    media.currentTime = 0;
    await media.play().catch(() => undefined);
  }

  async function stopReferenceMonitor() {
    try { monitorMediaRef.current?.pause(); } catch {}
    try { monitorAttachmentRef.current?.destroy(); } catch {}
    try { monitorMediaRef.current?.removeAttribute('src'); monitorMediaRef.current?.load(); } catch {}
    await monitorEngineRef.current?.close().catch(() => undefined);
    monitorEngineRef.current = null;
    monitorMediaRef.current = null;
    monitorAttachmentRef.current = null;
  }

  async function startRecording() {
    setError(''); setStatus(''); setDiagnostic(''); setPostedHref(''); setResult(null); setPlaying(false);
    if (!referenceSource) return setError('Essa atividade ainda não tem vídeo de referência vinculado.');
    if (!cameraRef.current || !referenceVideoRef.current || !canvasRef.current) return setError('Elementos de gravação indisponíveis.');
    try {
      await previewEngineRef.current?.close().catch(() => undefined);
      previewEngineRef.current = null;
      const engine = new DuetRecorderEngine({ camera: cameraRef.current, referenceVideo: referenceVideoRef.current, canvas: canvasRef.current }, { referenceUrl: referenceSource });
      recorderEngineRef.current = engine;
      await engine.prepare();
      await startReferenceMonitor();
      await engine.start();
      setStep('recording');
      setStatus('Gravando com referência monitorada pelo AudioEngine e vídeo da referência mudo.');
    } catch (err) {
      await stopReferenceMonitor();
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
      await stopReferenceMonitor();
      setResult(recording);
      setStep('review');
      setStatus('Gravação pronta. Abra o preview para mixar voz e referência com faders reais.');
    } catch (err) {
      await stopReferenceMonitor();
      setStep('intro');
      setError(`Não consegui finalizar a gravação: ${errorText(err)}`);
    }
  }

  async function ensurePreviewEngine() {
    if (!result?.canvasBlob || !result?.voiceBlob || !referenceSource) throw new Error('preview_missing_media');
    if (!previewVisualRef.current || !previewVoiceRef.current || !previewReferenceRef.current) throw new Error('preview_refs_missing');
    if (previewEngineRef.current) return previewEngineRef.current;
    const engine = new DuetPreviewEngine({ visual: previewVisualRef.current, voice: previewVoiceRef.current, reference: previewReferenceRef.current }, { visualBlob: result.canvasBlob, voiceBlob: result.voiceBlob, referenceUrl: referenceSource, initialFaders: { voice: voiceVolume, reference: referenceVolume }, preGains: { voice: 3.2, reference: 0.08 }, referenceOffsetMs });
    previewEngineRef.current = engine;
    await engine.prepare();
    return engine;
  }

  async function playPreview() {
    setError('');
    try {
      const engine = await ensurePreviewEngine();
      engine.setReferenceOffsetMs(referenceOffsetMs);
      engine.setFaders({ voice: voiceVolume, reference: referenceVolume });
      await engine.play();
      setPlaying(true);
      setStatus('Preview tocando: vídeo mudo + voz e referência pelo AudioEngine.');
    } catch (err) { setPlaying(false); setError(`Não consegui iniciar o preview: ${errorText(err)}`); }
  }

  function pausePreview() { previewEngineRef.current?.pause(); setPlaying(false); }
  function setVoice(value: number) { setVoiceVolume(value); previewEngineRef.current?.setFaders({ voice: value }); }
  function setReference(value: number) { setReferenceVolume(value); previewEngineRef.current?.setFaders({ reference: value }); }
  function setReferenceOffset(value: number) { setReferenceOffsetMsState(value); previewEngineRef.current?.setReferenceOffsetMs(value); setStatus(value === 0 ? 'Sincronia da referência zerada.' : `Sincronia ajustada: ${value > 0 ? 'referência atrasa' : 'referência adianta'} ${Math.abs(value)}ms. Toque novamente para ouvir do início.`); }
  function autoMix() { setVoiceVolume(110); setReferenceVolume(70); previewEngineRef.current?.autoMix(); setStatus('Auto Mix aplicado: voz presente e referência em apoio.'); }

  function runDiagnostic() {
    const snapshot = previewEngineRef.current?.getDiagnostic();
    if (!snapshot) return setDiagnostic('Abra o preview primeiro para medir o mixer.');
    setDiagnostic(['DIAGNÓSTICO DO PREVIEW ENGINE', `context=${snapshot.contextState}`, `voiceGain=${snapshot.voiceGain.toFixed(4)} · voiceDb=${snapshot.voiceDb.toFixed(1)} dBFS · voiceTime=${snapshot.voiceTime.toFixed(2)} · paused=${snapshot.voicePaused} · drift=${snapshot.voiceDriftMs}ms`, `referenceGain=${snapshot.referenceGain.toFixed(4)} · referenceDb=${snapshot.referenceDb.toFixed(1)} dBFS · referenceTime=${snapshot.referenceTime.toFixed(2)} · paused=${snapshot.referencePaused} · drift=${snapshot.referenceDriftMs}ms`, `referenceOffset=${snapshot.referenceOffsetMs}ms`, `masterDb=${snapshot.masterDb.toFixed(1)} dBFS · visualTime=${snapshot.visualTime.toFixed(2)} · visualPaused=${snapshot.visualPaused}`].join('\n'));
  }

  async function runReferenceFaderTest() {
    setError('');
    try {
      const engine = await ensurePreviewEngine();
      if (!playing) { engine.setReferenceOffsetMs(referenceOffsetMs); await engine.play(); setPlaying(true); }
      const oldVoice = voiceVolume;
      const oldReference = referenceVolume;
      const levels = [0, 1, 20, 50, 100];
      const rows: string[] = [];
      setVoiceVolume(0); engine.setFaders({ voice: 0 });
      for (const level of levels) { setReferenceVolume(level); engine.setFaders({ reference: level }); await sleep(650); const snapshot = engine.getDiagnostic(); rows.push(`${level}% → gain=${snapshot.referenceGain.toFixed(5)} · referenceDb=${snapshot.referenceDb.toFixed(1)} dBFS · masterDb=${snapshot.masterDb.toFixed(1)} dBFS · paused=${snapshot.referencePaused}`); }
      setVoiceVolume(oldVoice); setReferenceVolume(oldReference); engine.setFaders({ voice: oldVoice, reference: oldReference });
      setDiagnostic(['TESTE DO FADER DA REFERÊNCIA', 'Voz forçada em 0% durante a medição.', ...rows, '', 'Leitura: se os dB mudam mas o ouvido não muda, existe áudio fora do mixer. Se os dB não mudam, o problema está no roteamento/gain da referência.'].join('\n'));
    } catch (err) { setError(`Não consegui medir o fader da referência: ${errorText(err)}`); }
  }

  async function reset() { pausePreview(); await previewEngineRef.current?.close().catch(() => undefined); previewEngineRef.current = null; setResult(null); setError(''); setStatus(''); setDiagnostic(''); setPostedHref(''); setStep('intro'); setPlaying(false); }

  async function buildUploadBlob() {
    if (!result?.canvasBlob || !result?.voiceBlob || !referenceSource) throw new Error('missing_render_media');
    setStatus(`Renderizando final com faders: voz ${voiceVolume}% · referência ${referenceVolume}% · sync ${referenceOffsetMs}ms...`);
    const renderer = new DuetRendererEngine({ visualBlob: result.canvasBlob, voiceBlob: result.voiceBlob, referenceUrl: referenceSource, faders: { voice: voiceVolume, reference: referenceVolume }, referenceOffsetMs });
    const rendered = await renderer.renderVideo();
    if (!rendered.blob || rendered.blob.size < 1000) throw new Error(`render_empty:${rendered.blob?.size || 0}`);
    setStatus('Vídeo final renderizado com a mix escolhida.');
    return rendered.blob;
  }

  async function submit() {
    if (!result?.canvasBlob) return setError('Grave o dueto antes de enviar.');
    const visibility = postCommunity ? 'community' : 'private';
    const reviewRequested = canSendForReview && sendForReview;
    if (!postCommunity && !reviewRequested) return setError(canSendForReview ? 'Escolha postar na comunidade, enviar para avaliação ou os dois.' : 'No modo gratuito, poste na comunidade para continuar.');
    setStep('posting'); setError(''); pausePreview();
    try {
      const uploadBlob = await buildUploadBlob();
      const fileType = uploadBlob.type || 'video/webm';
      const data = new FormData();
      data.set('lesson_slug', lessonSlug); data.set('caption', caption || 'Minha prática do dueto.'); data.set('visibility', visibility); data.set('review_requested', String(reviewRequested)); data.set('voice_volume', String(voiceVolume)); data.set('reference_volume', String(referenceVolume)); data.set('voice_preset', 'natural'); data.set('noise_reduction', 'false'); data.set('file', new File([uploadBlob], `${lessonSlug}-dueto-final.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) { const json = await response.json().catch(() => null); throw new Error(json?.detail || json?.message || 'Não consegui enviar sua atividade.'); }
      const json = await response.json().catch(() => null);
      const communityPostId = String(json?.community_post_id || '');
      setPostedHref(postCommunity ? `/aluno/comunidade${communityPostId ? `#post-${communityPostId}` : ''}` : ''); setStep('posted');
    } catch (err) { setError(`Não consegui enviar sua atividade: ${errorText(err)}`); setStep('review'); }
  }

  const shell: React.CSSProperties = { minHeight: '100dvh', background: 'radial-gradient(circle at 50% 0%, rgba(245,199,107,.18), transparent 34%), linear-gradient(180deg,#050506,#09090b 54%,#030304)', color: '#fff', padding: '18px 16px 34px' };
  const wrap: React.CSSProperties = { maxWidth: 920, margin: '0 auto', display: 'grid', gap: 18 };
  const glass: React.CSSProperties = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 28, background: 'linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.035))', boxShadow: '0 24px 80px rgba(0,0,0,.38)', backdropFilter: 'blur(18px)' };
  const pill: React.CSSProperties = { border: 0, borderRadius: 999, padding: '14px 20px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', fontSize: 16 };
  const mutedPill: React.CSSProperties = { ...pill, background: 'rgba(255,255,255,.12)', color: '#fff' };
  const goldPill: React.CSSProperties = { ...pill, background: 'linear-gradient(135deg,#f8d47b,#f3bd49)', color: '#17120a' };

  return <main style={shell}><section style={wrap}>
    <header style={{ ...glass, padding: 22, display: 'grid', gap: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><span style={{ color: '#f5c76b', letterSpacing: 2, fontWeight: 950, fontSize: 13 }}>DUETO PREMIUM</span><span style={{ opacity: .7, fontSize: 13 }}>{step === 'recording' ? 'Gravando agora' : step === 'review' ? 'Mix Engine' : 'Treino guiado'}</span></div><h1 style={{ margin: 0, fontSize: 'clamp(34px,8vw,56px)', lineHeight: .95, letterSpacing: -1.8 }}>Grave seu dueto</h1><p style={{ margin: 0, color: 'rgba(255,255,255,.68)', fontSize: 17 }}>Aula: {lessonTitle}</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}><span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', color: '#f6d28a', fontWeight: 800, fontSize: 13 }}><Headphones size={16} /> Use fone para melhor resultado</span><span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', color: 'rgba(255,255,255,.62)', fontWeight: 700, fontSize: 13 }}><Music2 size={16} /> Engines modulares ativas</span></div></header>
    {error ? <div style={{ ...glass, padding: 16, borderColor: 'rgba(255,80,80,.45)', color: '#ffb4b4' }}>{error}</div> : null}
    {status ? <div style={{ ...glass, padding: 16, color: '#f5c76b', whiteSpace: 'pre-wrap' }}>{status}</div> : null}
    {diagnostic ? <div style={{ ...glass, padding: 16, color: '#d9f99d', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>{diagnostic}</div> : null}
    <section style={{ ...glass, overflow: 'hidden', padding: 0 }}><div style={{ position: 'relative', aspectRatio: '16/9', background: '#000', display: 'grid', placeItems: 'center' }}><video ref={referenceVideoRef} playsInline muted style={{ display: 'none' }} /><video ref={cameraRef} playsInline muted autoPlay style={{ display: 'none' }} /><audio ref={previewVoiceRef} preload="auto" style={{ display: 'none' }} /><audio ref={previewReferenceRef} preload="auto" style={{ display: 'none' }} />{result?.canvasBlob && step !== 'recording' ? <video ref={previewVisualRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} onEnded={pausePreview} /> : <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}{step === 'intro' ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, background: 'radial-gradient(circle,rgba(0,0,0,.18),rgba(0,0,0,.55))' }}><div style={{ display: 'grid', placeItems: 'center', gap: 12 }}><span style={{ width: 78, height: 78, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(245,199,107,.16)', border: '1px solid rgba(245,199,107,.45)', color: '#f5c76b' }}><Video size={34} /></span><strong style={{ fontSize: 18 }}>Toque para iniciar câmera e referência</strong><small style={{ color: 'rgba(255,255,255,.62)' }}>A referência será ouvida pelo AudioEngine.</small></div></div> : null}{step === 'recording' ? <div style={{ position: 'absolute', top: 14, left: 14, background: '#e11d48', borderRadius: 999, padding: '8px 13px', fontWeight: 950, boxShadow: '0 0 24px rgba(225,29,72,.5)' }}>● Gravando</div> : null}</div></section>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>{step === 'intro' ? <button style={{ ...goldPill, gridColumn: '1 / -1' }} onClick={startRecording}><Mic size={20} /> Iniciar gravação</button> : null}{step === 'recording' ? <button style={{ ...pill, gridColumn: '1 / -1', background: '#e11d48', color: '#fff' }} onClick={stopRecording}><Square size={20} /> Finalizar gravação</button> : null}{step === 'review' ? <><button style={mutedPill} onClick={reset}><RefreshCcw size={19} /> Regravar</button><button style={goldPill} onClick={submit}><Send size={19} /> Continuar envio</button></> : null}{step === 'posting' ? <button style={{ ...mutedPill, gridColumn: '1 / -1' }} disabled>Enviando...</button> : null}</section>
    {step === 'review' ? <section style={{ ...glass, padding: 18, display: 'grid', gap: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><h2 style={{ margin: 0, fontSize: 24 }}>Mixagem com PreviewEngine</h2><p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.62)' }}>Vídeo mudo, voz e referência em trilhas independentes.</p></div><SlidersHorizontal color="#f5c76b" /></div><div style={{ border: '1px solid rgba(245,199,107,.2)', borderRadius: 18, padding: 12, color: 'rgba(255,255,255,.68)', fontSize: 13, lineHeight: 1.45 }}>Gravou sem fone e ouviu pelo alto-falante? A referência pode ter vazado no microfone. Nesse caso, deixe a referência original bem baixa ou em 0% para evitar eco/latência.</div><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Minha voz</span><span>{voiceVolume}%</span></span><input type="range" min="0" max="200" value={voiceVolume} onChange={(event) => setVoice(Number(event.target.value))} /></label><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Referência original</span><span>{referenceVolume}%</span></span><input type="range" min="0" max="200" value={referenceVolume} onChange={(event) => setReference(Number(event.target.value))} /></label><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Sincronia da referência</span><span>{referenceOffsetMs > 0 ? `+${referenceOffsetMs}` : referenceOffsetMs}ms</span></span><input type="range" min="-300" max="300" step="10" value={referenceOffsetMs} onChange={(event) => setReferenceOffset(Number(event.target.value))} /><small style={{ color: 'rgba(255,255,255,.55)' }}>Negativo adianta a referência. Positivo atrasa a referência. Toque novamente para ouvir do início.</small></label><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button style={mutedPill} onClick={() => { setVoice(100); setReference(100); setReferenceOffset(0); }}>Reset</button><button style={mutedPill} onClick={autoMix}>Auto Mix</button><button style={mutedPill} onClick={runDiagnostic}>Medir engine</button><button style={mutedPill} onClick={runReferenceFaderTest}>Teste referência</button><button style={goldPill} onClick={playing ? pausePreview : playPreview}>{playing ? <Pause size={18} /> : <Play size={18} />}{playing ? 'Pausar mix' : 'Ouvir mix'}</button></div></section> : null}
    {result ? <section style={{ ...glass, padding: 18 }}><h2 style={{ marginTop: 0, fontSize: 22 }}>Diagnóstico técnico</h2><div style={{ display: 'grid', gap: 8, color: 'rgba(255,255,255,.78)' }}><span>✅ Vídeo composto: <strong>{formatSize(result.canvasBlob)}</strong></span><span>✅ Voz limpa: <strong>{formatSize(result.voiceBlob)}</strong></span><span>✅ Referência: <strong>arquivo original via AudioEngine</strong></span><span>ℹ️ Câmera bruta: <strong>{formatSize(result.cameraBlob)}</strong></span></div></section> : null}
    {step === 'review' ? <section style={{ ...glass, padding: 18, display: 'grid', gap: 14 }}><h2 style={{ margin: 0, fontSize: 24 }}>Publicação</h2><label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800 }}><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Postar na comunidade</label><label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800, opacity: canSendForReview ? 1 : .55 }}><input type="checkbox" checked={sendForReview && canSendForReview} disabled={!canSendForReview} onChange={(event) => setSendForReview(event.target.checked)} /> Enviar para avaliação</label><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda..." style={{ width: '100%', minHeight: 108, borderRadius: 18, padding: 14, background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.12)', outline: 'none', resize: 'vertical' }} /></section> : null}
    {step === 'posted' ? <section style={{ ...glass, padding: 22, display: 'grid', gap: 12, placeItems: 'start' }}><CheckCircle2 color="#86efac" size={36} /><h2 style={{ margin: 0 }}>Vídeo enviado</h2><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{postedHref ? <a style={{ ...goldPill, textDecoration: 'none' }} href={postedHref}>Ver postagem</a> : null}<a style={{ ...mutedPill, textDecoration: 'none' }} href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
  </section></main>;
}
