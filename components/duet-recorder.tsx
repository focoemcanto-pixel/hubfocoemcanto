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

  return <main className="duet-page">
    <style>{`
      .duet-page{min-height:100dvh;background:radial-gradient(circle at 50% -8%,rgba(246,202,105,.18),transparent 34%),linear-gradient(180deg,#070707 0%,#0a0a0c 52%,#030304 100%);color:#fff;padding:18px 14px 38px;overflow-x:hidden}.duet-shell{width:min(100%,900px);margin:0 auto;display:grid;gap:22px}.duet-topbar{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:8px 2px}.duet-back,.duet-link-btn{border:0;background:transparent;color:#fff;text-decoration:none;font-weight:900;font-size:16px}.duet-link-btn{color:#f5c76b}.duet-glass{border:1px solid rgba(255,255,255,.115);background:linear-gradient(145deg,rgba(255,255,255,.09),rgba(255,255,255,.035));box-shadow:0 24px 80px rgba(0,0,0,.45);backdrop-filter:blur(18px)}.duet-hero{position:relative;overflow:hidden;border-radius:30px;padding:28px;min-height:260px;display:grid;align-content:space-between}.duet-hero:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 84% 30%,rgba(245,199,107,.24),transparent 30%),linear-gradient(90deg,rgba(0,0,0,.16),transparent 68%);pointer-events:none}.duet-hero:after{content:"";position:absolute;right:22px;top:42px;width:150px;height:150px;border-radius:38px;background:radial-gradient(circle,rgba(248,212,123,.24),rgba(248,212,123,.05) 45%,transparent 70%);filter:blur(.2px);opacity:.85}.duet-eyebrow{margin:0;color:#f5c76b;font-size:13px;font-weight:950;letter-spacing:4px;text-transform:uppercase}.duet-title{position:relative;z-index:1;margin:20px 0 10px;font-family:Georgia,serif;font-size:clamp(42px,11vw,68px);line-height:.9;letter-spacing:-2px;max-width:680px}.duet-subtitle{position:relative;z-index:1;margin:0;color:rgba(255,255,255,.7);font-size:clamp(18px,4.6vw,25px);line-height:1.25}.duet-hero-cards{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:24px;max-width:650px}.duet-info-card{min-width:0;border:1px solid rgba(255,255,255,.11);border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.035));padding:16px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center}.duet-info-card svg{color:#f5c76b;flex:0 0 auto}.duet-info-card strong{display:block;font-size:clamp(15px,4vw,20px);line-height:1.15}.duet-info-card small{display:block;color:rgba(255,255,255,.6);font-size:clamp(12px,3.4vw,14px);line-height:1.35;margin-top:4px}.duet-section-title{margin:0;color:#f5c76b;font-size:13px;font-weight:950;letter-spacing:4px;text-transform:uppercase}.duet-stage{border-radius:28px;border-color:rgba(245,199,107,.42);overflow:hidden}.duet-stage-inner{position:relative;aspect-ratio:16/9;min-height:265px;background:radial-gradient(circle at center,rgba(255,255,255,.04),#000 62%);display:grid;place-items:center}.duet-stage-inner canvas,.duet-stage-inner video.duet-preview{width:100%;height:100%;object-fit:cover}.duet-placeholder{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:rgba(255,255,255,.56);font-weight:700;background:radial-gradient(circle,rgba(255,255,255,.035),rgba(0,0,0,.42))}.duet-placeholder svg{margin:0 auto 12px;color:rgba(255,255,255,.52)}.duet-countdown{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.78);z-index:3}.duet-count-number{width:130px;height:130px;border-radius:999px;display:grid;place-items:center;border:2px solid rgba(245,199,107,.68);box-shadow:0 0 44px rgba(245,199,107,.2),inset 0 0 28px rgba(245,199,107,.08);color:#f5c76b;font-size:62px;font-weight:950}.duet-recording-badge{position:absolute;top:14px;left:14px;background:#e11d48;border-radius:999px;padding:9px 14px;font-weight:950;box-shadow:0 0 24px rgba(225,29,72,.5)}.duet-controls-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.duet-control-card{min-width:0;border-radius:20px;padding:15px 12px;min-height:98px}.duet-control-card svg{color:#f5c76b}.duet-control-card strong{display:block;margin-top:12px;font-size:clamp(14px,3.6vw,18px)}.duet-control-card small{display:block;margin-top:5px;color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.duet-rec-panel{border-radius:28px;padding:18px;display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center}.duet-pill{border:0;border-radius:999px;padding:14px 18px;font-weight:950;display:inline-flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-size:15px}.duet-pill-muted{background:rgba(255,255,255,.11);color:#fff}.duet-pill-gold{background:linear-gradient(135deg,#f8d47b,#f3bd49);color:#17120a}.duet-record-main{width:100px;height:100px;border-radius:999px;padding:0;justify-self:center;background:linear-gradient(135deg,#f8d47b,#f3bd49);color:#17120a;box-shadow:0 16px 55px rgba(245,199,107,.22)}.duet-stop-main{background:#e11d48;color:#fff;box-shadow:0 16px 55px rgba(225,29,72,.22)}.duet-status{border-radius:22px;padding:14px 16px;color:#f5c76b}.duet-error{border-radius:22px;padding:14px 16px;border-color:rgba(255,80,80,.45);color:#ffb4b4}.duet-editor,.duet-publish,.duet-posting,.duet-done{border-radius:28px;padding:20px;display:grid;gap:16px}.duet-editor-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.duet-editor h2,.duet-publish h2{margin:8px 0 0;font-size:30px;letter-spacing:-.6px}.duet-reset{border:0;background:transparent;color:#f5c76b;font-weight:950;font-size:16px}.duet-auto{border:1px solid rgba(245,199,107,.45);border-radius:20px;padding:17px;text-align:left;background:linear-gradient(180deg,rgba(245,199,107,.17),rgba(245,199,107,.06));color:#fff}.duet-auto small{color:rgba(255,255,255,.66)}.duet-range{display:grid;gap:9px}.duet-range span{display:flex;justify-content:space-between;font-weight:950}.duet-range b{color:#f5c76b}.duet-range input{width:100%;accent-color:#f5c76b}.duet-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.duet-preset{border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:17px;min-height:82px;text-align:left;background:rgba(255,255,255,.04);color:#fff;cursor:pointer}.duet-preset.active{border-color:rgba(245,199,107,.75);background:linear-gradient(180deg,rgba(245,199,107,.18),rgba(245,199,107,.07))}.duet-preset strong{font-size:22px}.duet-preset small{color:rgba(255,255,255,.58)}.duet-actions{display:flex;gap:10px;flex-wrap:wrap}.duet-choice{border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:15px;background:rgba(255,255,255,.045);display:flex;gap:13px;align-items:center;text-align:left;color:#fff;cursor:pointer}.duet-choice.active{border-color:rgba(245,199,107,.7);background:linear-gradient(180deg,rgba(245,199,107,.16),rgba(245,199,107,.06))}.duet-check{width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:rgba(255,255,255,.1);flex:0 0 auto}.duet-choice.active .duet-check{background:#0ea5e9}.duet-choice small{color:rgba(255,255,255,.58)}.duet-textarea{width:100%;min-height:112px;border-radius:18px;padding:15px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12);outline:none;resize:vertical;box-sizing:border-box;font-size:16px}.duet-progress{height:10px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}.duet-progress div{height:100%;border-radius:999px;background:linear-gradient(90deg,#f8d47b,#f3bd49);transition:width .45s ease}@media(max-width:640px){.duet-page{padding:16px 14px 32px}.duet-shell{gap:19px}.duet-hero{border-radius:27px;padding:24px 22px;min-height:270px}.duet-hero:after{right:-18px;top:24px;width:135px;height:135px;opacity:.55}.duet-hero-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.duet-info-card{grid-template-columns:1fr;padding:14px;gap:9px}.duet-info-card strong{font-size:17px}.duet-info-card small{font-size:13px}.duet-stage-inner{min-height:275px;aspect-ratio:1.03/1}.duet-controls-grid{gap:8px}.duet-control-card{border-radius:18px;padding:13px 10px;min-height:92px}.duet-control-card strong{font-size:15px}.duet-control-card small{font-size:13px}.duet-rec-panel{grid-template-columns:1fr auto 1fr;padding:14px;gap:8px}.duet-pill{font-size:13px;padding:12px 11px}.duet-record-main{width:86px;height:86px}.duet-presets{grid-template-columns:repeat(2,minmax(0,1fr))}.duet-preset{padding:15px;min-height:80px}.duet-preset strong{font-size:20px}.duet-actions .duet-pill{flex:1}.duet-title{max-width:100%}}@media(max-width:390px){.duet-hero{padding:22px 18px}.duet-title{font-size:45px}.duet-info-card strong{font-size:16px}.duet-info-card small{font-size:12px}.duet-control-card{padding:12px 8px}.duet-control-card strong{font-size:14px}.duet-control-card small{font-size:12px}.duet-pill{font-size:12px}.duet-record-main{width:80px;height:80px}.duet-editor,.duet-publish,.duet-posting,.duet-done{padding:18px}.duet-editor h2,.duet-publish h2{font-size:27px}}
    `}</style>
    <section className="duet-shell">
      <nav className="duet-topbar"><a className="duet-back" href={`/aluno/aula/${lessonSlug}`}>← Voltar para a aula</a>{step === 'recording' ? <button onClick={stopRecording} className="duet-link-btn">Finalizar gravação</button> : step === 'review' ? <button onClick={submit} className="duet-link-btn">Publicar</button> : null}</nav>

      <header className="duet-glass duet-hero"><div><p className="duet-eyebrow">Atividade prática</p><h1 className="duet-title">Grave seu dueto</h1><p className="duet-subtitle">Aula: {lessonTitle}</p></div><div className="duet-hero-cards"><div className="duet-info-card"><Headphones size={30} /><span><strong>Use fone de ouvido</strong><small>Melhor captação da voz.</small></span></div><div className="duet-info-card"><Crown size={28} /><span><strong>{canSendForReview ? 'Modo VIP' : 'Modo gratuito'}</strong><small>Grave e publique na comunidade.</small></span></div></div></header>

      {error ? <div className="duet-glass duet-error">{error}</div> : null}
      {status && step !== 'posting' && step !== 'countdown' ? <div className="duet-glass duet-status">{status}</div> : null}

      <p className="duet-section-title">Sua tela de gravação</p>
      <section className="duet-glass duet-stage"><div className="duet-stage-inner"><video ref={referenceVideoRef} playsInline muted style={{ display: 'none' }} /><video ref={cameraRef} playsInline muted autoPlay style={{ display: 'none' }} /><audio ref={previewVoiceRef} preload="auto" style={{ display: 'none' }} /><audio ref={previewReferenceRef} preload="auto" style={{ display: 'none' }} />{result?.canvasBlob && step !== 'recording' && step !== 'countdown' ? <video ref={previewVisualRef} playsInline muted className="duet-preview" onEnded={pausePreview} /> : <canvas ref={canvasRef} width={1280} height={720} />}{step === 'intro' ? <div className="duet-placeholder"><div><Video size={46} /><span>O vídeo do seu dueto<br />aparecerá aqui</span></div></div> : null}{step === 'countdown' ? <div className="duet-countdown"><div><div className="duet-count-number">{countdown}</div><p style={{ margin: '14px 0 0', fontWeight: 900, textAlign: 'center' }}>Prepare-se</p></div></div> : null}{step === 'recording' ? <div className="duet-recording-badge">● Gravando</div> : null}</div></section>

      {step === 'intro' || step === 'recording' || step === 'countdown' ? <><p className="duet-section-title">Controles da gravação</p><section className="duet-controls-grid"><div className="duet-glass duet-control-card"><Mic size={26} /><strong>Câmera</strong><small>Frontal</small></div><div className="duet-glass duet-control-card"><Video size={26} /><strong>Qualidade</strong><small>1080p</small></div><div className="duet-glass duet-control-card"><Mic size={26} /><strong>Áudio</strong><small>Microfone</small></div><div className="duet-glass duet-control-card"><Headphones size={26} /><strong>Dicas</strong><small>Use fone</small></div></section><section className="duet-glass duet-rec-panel"><button className="duet-pill duet-pill-muted" type="button" onClick={startReferenceMonitor}><Play size={18} /> Ouvir base</button>{step === 'recording' ? <button className="duet-pill duet-record-main duet-stop-main" onClick={stopRecording}><Square size={30} /></button> : <button className="duet-pill duet-record-main" onClick={startRecording} disabled={step === 'countdown'}><Video size={34} /></button>}<button className="duet-pill duet-pill-muted" type="button"><RotateCcw size={18} /> Virar câmera</button></section></> : null}

      {step === 'posting' ? <section className="duet-glass duet-posting"><strong style={{ fontSize: 22 }}>Publicando seu dueto</strong><p style={{ margin: 0, color: 'rgba(255,255,255,.62)' }}>{status || 'Preparando sua publicação...'}</p><div className="duet-progress"><div style={{ width: `${Math.max(8, postingProgress)}%` }} /></div><small style={{ color: 'rgba(255,255,255,.48)' }}>Mantenha esta tela aberta até concluir.</small></section> : null}

      {step === 'review' ? <section className="duet-glass duet-editor"><div className="duet-editor-head"><div><p className="duet-section-title">Editor ao vivo</p><h2>Volume e efeito</h2></div><button type="button" onClick={autoMix} className="duet-reset">Reset</button></div><button type="button" onClick={autoMix} className="duet-auto"><strong>✨ Melhorar automaticamente</strong><br /><small>Normaliza o ganho das faixas e deixa os volumes prontos.</small></button><label className="duet-range"><span><span>🎙️ Voz</span><b>{voiceVolume}%</b></span><input type="range" min="0" max="200" value={voiceVolume} onChange={(event) => setVoice(Number(event.target.value))} /></label><label className="duet-range"><span><span>♪ Referência</span><b>{referenceVolume}%</b></span><input type="range" min="0" max="200" value={referenceVolume} onChange={(event) => setReference(Number(event.target.value))} /></label><div className="duet-presets">{(Object.keys(presetInfo) as Preset[]).map((key) => <button key={key} type="button" onClick={() => applyPreset(key)} className={`duet-preset ${preset === key ? 'active' : ''}`}><strong>{presetInfo[key].title}</strong><br /><small>{presetInfo[key].text}</small></button>)}</div><details><summary style={{ cursor: 'pointer', color: '#f5c76b', fontWeight: 900 }}>Ajustar sincronia</summary><label className="duet-range" style={{ marginTop: 12 }}><span><span>Sincronia</span><b>{referenceOffsetMs > 0 ? `+${referenceOffsetMs}` : referenceOffsetMs}ms</b></span><input type="range" min="-300" max="300" step="10" value={referenceOffsetMs} onChange={(event) => setReferenceOffset(Number(event.target.value))} /></label></details><div className="duet-actions"><button className="duet-pill duet-pill-muted" onClick={reset}><RefreshCcw size={18} /> Regravar</button><button className="duet-pill duet-pill-gold" onClick={playing ? pausePreview : playPreview}>{playing ? <Pause size={18} /> : <Play size={18} />}{playing ? 'Pausar mix' : 'Ouvir mix'}</button></div></section> : null}

      {step === 'review' ? <section className="duet-glass duet-publish"><h2>Publicação</h2><button type="button" onClick={() => setPostCommunity(!postCommunity)} className={`duet-choice ${postCommunity ? 'active' : ''}`}><span className="duet-check">{postCommunity ? '✓' : ''}</span><span><strong>Postar na comunidade</strong><br /><small>Compartilhe seu dueto com os alunos.</small></span></button><button type="button" disabled={!canSendForReview} onClick={() => canSendForReview && setSendForReview(!sendForReview)} className={`duet-choice ${sendForReview && canSendForReview ? 'active' : ''}`} style={{ opacity: canSendForReview ? 1 : .58 }}><span className="duet-check">{sendForReview && canSendForReview ? '✓' : ''}</span><span><strong>Enviar para avaliação</strong><br /><small>Receba orientação do professor.</small></span></button><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda..." className="duet-textarea" /><button onClick={submit} className="duet-pill duet-pill-gold" style={{ width: '100%' }}><Send size={19} /> Publicar dueto</button></section> : null}

      {step === 'posted' ? <section className="duet-glass duet-done"><CheckCircle2 color="#86efac" size={36} /><h2 style={{ margin: 0 }}>Vídeo enviado</h2><div className="duet-actions">{postedHref ? <a className="duet-pill duet-pill-gold" style={{ textDecoration: 'none' }} href={postedHref}>Ver postagem</a> : null}<a className="duet-pill duet-pill-muted" style={{ textDecoration: 'none' }} href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
    </section>
  </main>;
}
