'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Headphones, Mic, Music2, Pause, Play, RefreshCcw, Send, SlidersHorizontal, Square, Video } from 'lucide-react';
import { proxiedVideoUrl } from '@/lib/audio/duet-recording-utils';
import { startDuetV2Session, type DuetV2RecordingResult, type DuetV2Session } from '@/lib/audio-v2';
import { renderFinalDuetVideo } from '@/lib/audio/duet-final-render';

type Props = { lessonTitle: string; lessonSlug: string; referenceUrl?: string | null; referenceEmbedUrl?: string | null; canSendForReview?: boolean };
type Step = 'intro' | 'recording' | 'review' | 'posting' | 'posted';
type LiveMixerGraph = { context: AudioContext; voiceGain: GainNode; referenceGain: GainNode; voiceCompressor: DynamicsCompressorNode; masterLimiter: DynamicsCompressorNode; analyser: AnalyserNode; analyserData: Float32Array };

const VOICE_PRE_GAIN = 3.2;
const REFERENCE_PRE_GAIN = 0.08;

function blobUrl(blob?: Blob | null) { return blob ? URL.createObjectURL(blob) : ''; }
function errorText(error: unknown) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error || 'erro_desconhecido'); }
function formatSize(blob?: Blob | null) { return blob?.size ? `${Math.round(blob.size / 1024)} KB` : 'vazio'; }
function makeAudioContext() { const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AudioCtx) throw new Error('audio_context_missing'); return new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 }); }
function sliderToGain(value: number, preGain = 1) { return Math.max(0, Math.min(6, (value / 100) * preGain)); }
function setupVoiceCompressor(node: DynamicsCompressorNode) { node.threshold.value = -22; node.knee.value = 18; node.ratio.value = 2.6; node.attack.value = 0.008; node.release.value = 0.16; }
function setupLimiter(node: DynamicsCompressorNode) { node.threshold.value = -3; node.knee.value = 0; node.ratio.value = 18; node.attack.value = 0.003; node.release.value = 0.08; }
function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl, canSendForReview = true }: Props) {
  const referenceSource = useMemo(() => proxiedVideoUrl(referenceUrl), [referenceUrl]);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const referenceRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveVisualRef = useRef<HTMLVideoElement | null>(null);
  const liveVoiceRef = useRef<HTMLAudioElement | null>(null);
  const liveReferenceRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<DuetV2Session | null>(null);
  const liveMixerRef = useRef<LiveMixerGraph | null>(null);
  const liveVoiceUrlRef = useRef('');
  const livePlayingRef = useRef(false);
  const [step, setStep] = useState<Step>('intro');
  const [error, setError] = useState('');
  const [result, setResult] = useState<DuetV2RecordingResult | null>(null);
  const [caption, setCaption] = useState('Minha prática do dueto.');
  const [postCommunity, setPostCommunity] = useState(!canSendForReview);
  const [sendForReview, setSendForReview] = useState(canSendForReview);
  const [postedHref, setPostedHref] = useState('');
  const [renderStatus, setRenderStatus] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [voiceVolume, setVoiceVolume] = useState(100);
  const [referenceVolume, setReferenceVolume] = useState(100);
  const [livePlaying, setLivePlaying] = useState(false);
  const previewUrl = useMemo(() => blobUrl(result?.canvasBlob), [result?.canvasBlob]);

  useEffect(() => () => { try { liveMixerRef.current?.context.close(); } catch {} if (liveVoiceUrlRef.current) URL.revokeObjectURL(liveVoiceUrlRef.current); }, []);

  function syncElementAudio(nextVoice = voiceVolume, nextReference = referenceVolume) {
    const visual = liveVisualRef.current;
    const voice = liveVoiceRef.current;
    const reference = liveReferenceRef.current;
    const isPlaying = livePlayingRef.current;
    if (voice) { voice.volume = 0; voice.muted = false; if (nextVoice <= 0) { try { voice.pause(); } catch {} } else if (isPlaying) { if (visual && Number.isFinite(visual.currentTime)) voice.currentTime = visual.currentTime; voice.play().catch(() => undefined); } }
    if (reference) { reference.volume = 0; reference.muted = false; if (nextReference <= 0) { try { reference.pause(); } catch {} } else if (isPlaying) { if (visual && Number.isFinite(visual.currentTime)) reference.currentTime = visual.currentTime; reference.play().catch(() => undefined); } }
  }

  function updateLiveGains(nextVoice = voiceVolume, nextReference = referenceVolume) {
    const graph = liveMixerRef.current;
    if (graph) { graph.voiceGain.gain.value = sliderToGain(nextVoice, VOICE_PRE_GAIN); graph.referenceGain.gain.value = sliderToGain(nextReference, REFERENCE_PRE_GAIN); }
    syncElementAudio(nextVoice, nextReference);
  }

  function readMasterDb() {
    const graph = liveMixerRef.current;
    if (!graph) return -120;
    graph.analyser.getFloatTimeDomainData(graph.analyserData);
    let sum = 0;
    for (const sample of graph.analyserData) sum += sample * sample;
    const rms = Math.sqrt(sum / graph.analyserData.length);
    return 20 * Math.log10(Math.max(rms, 0.000001));
  }

  function ensureLiveMixer() {
    if (liveMixerRef.current) return liveMixerRef.current;
    const voice = liveVoiceRef.current;
    const reference = liveReferenceRef.current;
    if (!voice || !reference) throw new Error('live_mixer_refs_missing');
    voice.volume = 0; voice.muted = false; reference.volume = 0; reference.muted = false;
    const context = makeAudioContext();
    const voiceSource = context.createMediaElementSource(voice);
    const referenceSourceNode = context.createMediaElementSource(reference);
    const voiceCompressor = context.createDynamicsCompressor();
    const masterLimiter = context.createDynamicsCompressor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    setupVoiceCompressor(voiceCompressor); setupLimiter(masterLimiter);
    const voiceGain = context.createGain(); const referenceGain = context.createGain();
    voiceSource.connect(voiceCompressor).connect(voiceGain).connect(masterLimiter);
    referenceSourceNode.connect(referenceGain).connect(masterLimiter);
    masterLimiter.connect(analyser).connect(context.destination);
    const graph = { context, voiceGain, referenceGain, voiceCompressor, masterLimiter, analyser, analyserData: new Float32Array(analyser.fftSize) };
    liveMixerRef.current = graph; updateLiveGains(); return graph;
  }

  function pauseLivePreview() { livePlayingRef.current = false; liveVisualRef.current?.pause(); liveVoiceRef.current?.pause(); liveReferenceRef.current?.pause(); setLivePlaying(false); }

  async function startLivePreview() {
    setError('');
    if (!result?.canvasBlob || !result?.voiceBlob || !referenceSource) return setError('Grave o dueto antes de ouvir o mix.');
    try {
      const visual = liveVisualRef.current, voice = liveVoiceRef.current, reference = liveReferenceRef.current;
      if (!visual || !voice || !reference) throw new Error('live_preview_refs_missing');
      const graph = ensureLiveMixer();
      if (liveVoiceUrlRef.current) URL.revokeObjectURL(liveVoiceUrlRef.current);
      liveVoiceUrlRef.current = URL.createObjectURL(result.voiceBlob);
      voice.src = liveVoiceUrlRef.current; reference.src = referenceSource;
      visual.currentTime = 0; voice.currentTime = 0; reference.currentTime = 0;
      visual.muted = true; visual.volume = 0; voice.volume = 0; reference.volume = 0; livePlayingRef.current = true; updateLiveGains();
      await graph.context.resume(); await visual.play();
      if (voiceVolume > 0) await voice.play().catch(() => undefined);
      if (referenceVolume > 0) await reference.play().catch(() => undefined);
      setLivePlaying(true); setRenderStatus(`Preview normalizado: voz ${voiceVolume}% · referência ${referenceVolume}%. Áudio nativo zerado; só o mixer toca.`);
    } catch (err) { setError(`Não consegui iniciar o preview ao vivo: ${errorText(err)}`); pauseLivePreview(); }
  }

  async function runReferenceFaderDiagnostic() {
    setDiagnostic('Rodando teste de fader...');
    if (!livePlayingRef.current) await startLivePreview();
    const oldVoice = voiceVolume, oldRef = referenceVolume;
    const levels = [0, 5, 13, 50, 100];
    const rows: string[] = [];
    setVoiceVolume(0); updateLiveGains(0, 0); await sleep(700);
    for (const level of levels) {
      setReferenceVolume(level); updateLiveGains(0, level); await sleep(900);
      rows.push(`${level}% → gain=${sliderToGain(level, REFERENCE_PRE_GAIN).toFixed(4)} · WebAudio=${readMasterDb().toFixed(1)} dBFS`);
    }
    setVoiceVolume(oldVoice); setReferenceVolume(oldRef); updateLiveGains(oldVoice, oldRef);
    setDiagnostic(`TESTE ISOLADO DA REFERÊNCIA\nVoz forçada em 0% durante o teste.\n${rows.join('\n')}\n\nInterpretação: se WebAudio cai mas o ouvido não cai, há áudio fora do mixer. Se WebAudio não cai, o GainNode/grafo está errado.`);
  }

  async function startRecording() { setError(''); setResult(null); setPostedHref(''); setRenderStatus(''); setDiagnostic(''); setLivePlaying(false); pauseLivePreview(); if (!referenceSource) return setError('Essa atividade ainda não tem vídeo de referência vinculado.'); try { const session = await startDuetV2Session({ referenceUrl: referenceSource }, { camera: cameraRef.current, reference: referenceRef.current, canvas: canvasRef.current }); sessionRef.current = session; setStep('recording'); } catch (err: any) { setStep('intro'); setError(err?.message || 'Não consegui iniciar a gravação. Permita câmera e microfone e tente novamente.'); } }
  async function stopRecording() { setError(''); const session = sessionRef.current; if (!session) return; try { const recording = await session.stop(); try { referenceRef.current?.pause(); if (referenceRef.current) { referenceRef.current.muted = true; referenceRef.current.volume = 0; } } catch {} sessionRef.current = null; setResult(recording); setRenderStatus('Preview visual pronto. Toque em Ouvir mix para escutar voz + referência original com controle real.'); setStep('review'); } catch (err: any) { setError(err?.message || 'Não consegui finalizar a gravação.'); setStep('intro'); } }
  function reset() { pauseLivePreview(); setResult(null); setError(''); setPostedHref(''); setRenderStatus(''); setDiagnostic(''); setStep('intro'); }
  function setVoice(value: number) { setVoiceVolume(value); updateLiveGains(value, referenceVolume); setRenderStatus(`Preview normalizado: voz ${value}% · referência ${referenceVolume}%.`); }
  function setReference(value: number) { setReferenceVolume(value); updateLiveGains(voiceVolume, value); setRenderStatus(`Preview normalizado: voz ${voiceVolume}% · referência ${value}%.`); }
  function autoMix() { setVoiceVolume(110); setReferenceVolume(70); updateLiveGains(110, 70); setRenderStatus('Auto Mix aplicado: voz presente e referência em apoio equilibrado.'); }

  async function buildUploadBlob() { if (!result?.canvasBlob || !result?.voiceBlob || !referenceSource) return result?.canvasBlob || null; setRenderStatus(`Renderizando final normalizado: voz ${voiceVolume}% · referência ${referenceVolume}%...`); const rendered = await renderFinalDuetVideo({ visualBlob: result.canvasBlob, voiceBlob: result.voiceBlob, referenceBlob: null, referenceSource, settings: { voiceVolume, referenceVolume, preset: 'natural', latencyMs: 0, noiseReduction: false } }); if (!rendered || rendered.size < 1000) throw new Error(`render_empty_or_too_small:${rendered?.size || 0}`); setRenderStatus('Vídeo final renderizado com mix normalizado.'); return rendered; }
  async function submit() { if (!result?.canvasBlob) return setError('Grave o dueto antes de enviar.'); const visibility = postCommunity ? 'community' : 'private'; const reviewRequested = canSendForReview && sendForReview; if (!postCommunity && !reviewRequested) return setError(canSendForReview ? 'Escolha postar na comunidade, enviar para avaliação ou os dois.' : 'No modo gratuito, poste na comunidade para continuar.'); setStep('posting'); setError(''); pauseLivePreview(); try { const uploadBlob = await buildUploadBlob(); if (!uploadBlob) throw new Error('Vídeo final indisponível.'); const data = new FormData(); const fileType = uploadBlob.type || 'video/webm'; data.set('lesson_slug', lessonSlug); data.set('caption', caption || 'Minha prática do dueto.'); data.set('visibility', visibility); data.set('review_requested', String(reviewRequested)); data.set('voice_volume', String(voiceVolume)); data.set('reference_volume', String(referenceVolume)); data.set('voice_preset', 'natural'); data.set('noise_reduction', 'false'); data.set('file', new File([uploadBlob], `${lessonSlug}-dueto-final.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType })); const response = await fetch('/api/submissions/duet', { method: 'POST', body: data }); if (!response.ok) { const json = await response.json().catch(() => null); throw new Error(json?.detail || json?.message || 'Não consegui enviar sua atividade.'); } const json = await response.json().catch(() => null); const communityPostId = String(json?.community_post_id || ''); setPostedHref(postCommunity ? `/aluno/comunidade${communityPostId ? `#post-${communityPostId}` : ''}` : ''); setStep('posted'); } catch (err: any) { setError(err?.message || 'Não consegui enviar sua atividade.'); setStep('review'); } }

  const shell: React.CSSProperties = { minHeight: '100dvh', background: 'radial-gradient(circle at 50% 0%, rgba(245,199,107,.18), transparent 34%), linear-gradient(180deg,#050506,#09090b 54%,#030304)', color: '#fff', padding: '18px 16px 34px' };
  const wrap: React.CSSProperties = { maxWidth: 920, margin: '0 auto', display: 'grid', gap: 18 };
  const glass: React.CSSProperties = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 28, background: 'linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.035))', boxShadow: '0 24px 80px rgba(0,0,0,.38)', backdropFilter: 'blur(18px)' };
  const pill: React.CSSProperties = { border: 0, borderRadius: 999, padding: '14px 20px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', fontSize: 16 };
  const mutedPill: React.CSSProperties = { ...pill, background: 'rgba(255,255,255,.12)', color: '#fff' };
  const goldPill: React.CSSProperties = { ...pill, background: 'linear-gradient(135deg,#f8d47b,#f3bd49)', color: '#17120a' };

  return <main style={shell}><section style={wrap}>
    <header style={{ ...glass, padding: 22, display: 'grid', gap: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><span style={{ color: '#f5c76b', letterSpacing: 2, fontWeight: 950, fontSize: 13 }}>DUETO PREMIUM</span><span style={{ opacity: .7, fontSize: 13 }}>{step === 'recording' ? 'Gravando agora' : step === 'review' ? 'Mix normalizado' : 'Treino guiado'}</span></div><h1 style={{ margin: 0, fontSize: 'clamp(34px,8vw,56px)', lineHeight: .95, letterSpacing: -1.8 }}>Grave seu dueto</h1><p style={{ margin: 0, color: 'rgba(255,255,255,.68)', fontSize: 17 }}>Aula: {lessonTitle}</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}><span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', color: '#f6d28a', fontWeight: 800, fontSize: 13 }}><Headphones size={16} /> Use fone para melhor resultado</span><span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', color: 'rgba(255,255,255,.62)', fontWeight: 700, fontSize: 13 }}><Music2 size={16} /> Som só pelo mixer</span></div></header>
    {error ? <div style={{ ...glass, padding: 16, borderColor: 'rgba(255,80,80,.45)', color: '#ffb4b4' }}>{error}</div> : null}
    {renderStatus ? <div style={{ ...glass, padding: 16, color: '#f5c76b', whiteSpace: 'pre-wrap' }}>{renderStatus}</div> : null}
    {diagnostic ? <div style={{ ...glass, padding: 16, color: '#d9f99d', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>{diagnostic}</div> : null}
    <section style={{ ...glass, overflow: 'hidden', padding: 0 }}><div style={{ position: 'relative', aspectRatio: '16/9', background: '#000', display: 'grid', placeItems: 'center' }}><video ref={referenceRef} playsInline muted style={{ display: 'none' }} /><video ref={cameraRef} playsInline muted autoPlay style={{ display: 'none' }} /><audio ref={liveVoiceRef} preload="auto" style={{ display: 'none' }} /><video ref={liveReferenceRef} playsInline preload="auto" style={{ display: 'none' }} />{previewUrl && step !== 'recording' ? <video ref={liveVisualRef} key={previewUrl} src={previewUrl} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} onEnded={pauseLivePreview} /> : <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}{step === 'intro' ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, background: 'radial-gradient(circle,rgba(0,0,0,.18),rgba(0,0,0,.55))' }}><div style={{ display: 'grid', placeItems: 'center', gap: 12 }}><span style={{ width: 78, height: 78, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(245,199,107,.16)', border: '1px solid rgba(245,199,107,.45)', color: '#f5c76b' }}><Video size={34} /></span><strong style={{ fontSize: 18 }}>Toque para iniciar câmera e referência</strong><small style={{ color: 'rgba(255,255,255,.62)' }}>A mixagem será feita em trilhas separadas.</small></div></div> : null}{step === 'recording' ? <div style={{ position: 'absolute', top: 14, left: 14, background: '#e11d48', borderRadius: 999, padding: '8px 13px', fontWeight: 950, boxShadow: '0 0 24px rgba(225,29,72,.5)' }}>● Gravando</div> : null}</div></section>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>{step === 'intro' ? <button style={{ ...goldPill, gridColumn: '1 / -1' }} onClick={startRecording}><Mic size={20} /> Iniciar gravação</button> : null}{step === 'recording' ? <button style={{ ...pill, gridColumn: '1 / -1', background: '#e11d48', color: '#fff' }} onClick={stopRecording}><Square size={20} /> Finalizar gravação</button> : null}{step === 'review' ? <><button style={mutedPill} onClick={reset}><RefreshCcw size={19} /> Regravar</button><button style={goldPill} onClick={submit}><Send size={19} /> Continuar envio</button></> : null}{step === 'posting' ? <button style={{ ...mutedPill, gridColumn: '1 / -1' }} disabled>Enviando...</button> : null}</section>
    {step === 'review' ? <section style={{ ...glass, padding: 18, display: 'grid', gap: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><h2 style={{ margin: 0, fontSize: 24 }}>Mixagem normalizada</h2><p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.62)' }}>O áudio nativo das mídias está zerado. O slider controla apenas o GainNode.</p></div><SlidersHorizontal color="#f5c76b" /></div><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Minha voz</span><span>{voiceVolume}%</span></span><input type="range" min="0" max="200" value={voiceVolume} onChange={(event) => setVoice(Number(event.target.value))} /></label><label style={{ display: 'grid', gap: 8 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Referência original</span><span>{referenceVolume}%</span></span><input type="range" min="0" max="200" value={referenceVolume} onChange={(event) => setReference(Number(event.target.value))} /></label><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button style={mutedPill} onClick={() => { setVoice(100); setReference(100); }}>Reset</button><button style={mutedPill} onClick={autoMix}>Auto Mix</button><button style={mutedPill} onClick={runReferenceFaderDiagnostic}>Medir fader</button><button style={goldPill} onClick={livePlaying ? pauseLivePreview : startLivePreview}>{livePlaying ? <Pause size={18} /> : <Play size={18} />}{livePlaying ? 'Pausar mix' : 'Ouvir mix'}</button></div></section> : null}
    {result ? <section style={{ ...glass, padding: 18 }}><h2 style={{ marginTop: 0, fontSize: 22 }}>Diagnóstico técnico</h2><div style={{ display: 'grid', gap: 8, color: 'rgba(255,255,255,.78)' }}><span>✅ Vídeo visual: <strong>{formatSize(result.canvasBlob)}</strong></span><span>✅ Voz separada: <strong>{formatSize(result.voiceBlob)}</strong> + compressor</span><span>✅ Referência: <strong>arquivo original</strong> via GainNode</span><span>ℹ️ Bruto da gravação: <strong>{formatSize(result.mixedBlob)}</strong> não usado no preview</span></div></section> : null}
    {step === 'review' ? <section style={{ ...glass, padding: 18, display: 'grid', gap: 14 }}><h2 style={{ margin: 0, fontSize: 24 }}>Publicação</h2><label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800 }}><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Postar na comunidade</label><label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800, opacity: canSendForReview ? 1 : .55 }}><input type="checkbox" checked={sendForReview && canSendForReview} disabled={!canSendForReview} onChange={(event) => setSendForReview(event.target.checked)} /> Enviar para avaliação</label><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda..." style={{ width: '100%', minHeight: 108, borderRadius: 18, padding: 14, background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.12)', outline: 'none', resize: 'vertical' }} /></section> : null}
    {step === 'posted' ? <section style={{ ...glass, padding: 22, display: 'grid', gap: 12, placeItems: 'start' }}><CheckCircle2 color="#86efac" size={36} /><h2 style={{ margin: 0 }}>Vídeo enviado</h2><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{postedHref ? <a style={{ ...goldPill, textDecoration: 'none' }} href={postedHref}>Ver postagem</a> : null}<a style={{ ...mutedPill, textDecoration: 'none' }} href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
  </section></main>;
}
