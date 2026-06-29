'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, CircleHelp, Crown, Headphones, Lock, Mic, Music2, Pause, Play, RefreshCcw, RotateCw, SlidersHorizontal, Sparkles, UploadCloud, Users, Video, X } from 'lucide-react';
import { DuetMixerPanel } from '@/components/duet/duet-mixer-panel';
import { prepareDuetCamera, type DuetFacingMode, type DuetMicMode } from '@/lib/audio/duet-camera';
import { isSafariLike, startDuetRecorder } from '@/lib/audio/duet-media';
import { buildDuetMonitorAudio } from '@/lib/audio/duet-monitor';
import { proxiedVideoUrl } from '@/lib/audio/duet-recording-utils';
import { useDuetBufferRecorder } from '@/lib/audio/use-duet-buffer-recorder';
import { renderFinalDuetVideo } from '@/lib/audio/duet-final-render';
import { calculateDuetAutoMix } from '@/lib/audio/duet-automix';
import { deviceHint, listAudioInputDevices, preferredPhoneMicDeviceId, type AudioInputDevice } from '@/lib/audio/audio-device-utils';
import { estimateDuetLatencyMs } from '@/lib/audio/duet-latency';
import type { VoicePreset } from '@/lib/audio/duet-buffer-engine';

type Props = { lessonTitle: string; lessonSlug: string; referenceUrl?: string | null; referenceEmbedUrl?: string | null; canSendForReview?: boolean };
type SubmitOptions = { postToCommunity: boolean; sendForReview: boolean };
type QualityMode = '720p' | '1080p';

const BACKGROUND_RENDER_TIMEOUT_MS = 20000;
const PUBLISH_RENDER_TIMEOUT_MS = 45000;
const DEFAULT_VOICE_VOLUME = 100;
const DEFAULT_REFERENCE_VOLUME = 100;
const DEFAULT_PRESET: VoicePreset = 'natural';
const VIP_CHECKOUT_URL = '/assinar/vip';
const MAX_RECORD_SECONDS = 300;
const PLACEHOLDER_SRC = '/images/duet-video-placeholder-mi';

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl, canSendForReview = true }: Props) {
  const referenceSource = proxiedVideoUrl(referenceUrl);
  const recorder = useDuetBufferRecorder(referenceSource, lessonSlug);
  const [caption, setCaption] = useState('');
  const [postCommunity, setPostCommunity] = useState(!canSendForReview);
  const [sendForReview, setSendForReview] = useState(canSendForReview);
  const [postedCommunityHref, setPostedCommunityHref] = useState('');
  const [postedSummary, setPostedSummary] = useState('Seu dueto foi processado conforme as opções escolhidas.');
  const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [micMode] = useState<DuetMicMode>('studio');
  const [cameraFacing, setCameraFacing] = useState<DuetFacingMode>('user');
  const [quality, setQuality] = useState<QualityMode>('1080p');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [audioSetupUnlocked, setAudioSetupUnlocked] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showVipModal, setShowVipModal] = useState(false);
  const [renderStatus, setRenderStatus] = useState('');
  const [publishProgress, setPublishProgress] = useState(0);
  const [isAutoMixing, setIsAutoMixing] = useState(false);
  const [autoMixMessage, setAutoMixMessage] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showTips, setShowTips] = useState(false);
  const [isPreviewingBase, setIsPreviewingBase] = useState(false);
  const premiumRenderCacheRef = useRef<{ signature: string; blob: Blob } | null>(null);
  const selectedAudioDevice = audioDevices.find((device) => device.deviceId === selectedAudioDeviceId) || null;
  const showBluetoothWarning = Boolean(selectedAudioDevice?.isLikelyHeadset);
  const hasPublishChoice = postCommunity || sendForReview;
  const isRecording = recorder.step === 'recording';
  const hasRecording = Boolean(recorder.previewUrl);
  const progress = Math.min(100, (recordingSeconds / MAX_RECORD_SECONDS) * 100);

  useEffect(() => { recorder.applySettings(); }, [recorder.voiceVolume, recorder.referenceVolume, recorder.preset, recorder.latencyMs, recorder.noiseReduction]);
  useEffect(() => {
    refreshAudioDevices(false).catch(() => undefined);
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const on = () => refreshAudioDevices(false).catch(() => undefined);
    md.addEventListener('devicechange', on);
    return () => md.removeEventListener('devicechange', on);
  }, []);
  useEffect(() => { document.body.classList.toggle('comments-open', showVipModal); return () => document.body.classList.remove('comments-open'); }, [showVipModal]);
  useEffect(() => {
    if (recorder.step !== 'recording') return;
    setRecordingSeconds(0);
    const timer = window.setInterval(() => setRecordingSeconds((value) => {
      const next = value + 1;
      if (next >= MAX_RECORD_SECONDS) window.setTimeout(stopRecording, 0);
      return Math.min(next, MAX_RECORD_SECONDS);
    }), 1000);
    return () => window.clearInterval(timer);
  }, [recorder.step]);

  function mixSignature() { return [recorder.voiceVolume, recorder.referenceVolume, recorder.preset, recorder.noiseReduction ? 'nr' : 'raw'].join(':'); }
  function needsPremiumRender() { return recorder.voiceVolume !== DEFAULT_VOICE_VOLUME || recorder.referenceVolume !== DEFAULT_REFERENCE_VOLUME || recorder.preset !== DEFAULT_PRESET || recorder.noiseReduction; }
  function chooseDevice(deviceId: string, devices = audioDevices) { setSelectedAudioDeviceId(deviceId); recorder.setLatencyMs(estimateDuetLatencyMs(devices.find((item) => item.deviceId === deviceId)?.label)); }
  async function refreshAudioDevices(preferPhoneMic = false) {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setIsLoadingDevices(true);
    try {
      const devices = await listAudioInputDevices();
      setAudioDevices(devices);
      if (!selectedAudioDeviceId || !devices.some((d) => d.deviceId === selectedAudioDeviceId)) chooseDevice(preferPhoneMic ? preferredPhoneMicDeviceId(devices) : devices[0]?.deviceId || '', devices);
    } finally { setIsLoadingDevices(false); }
  }
  async function unlockAudioSetup() {
    const askAudio = (navigator.mediaDevices as any)?.['get' + 'UserMedia'];
    if (!askAudio) return;
    setIsLoadingDevices(true);
    try {
      const probe = await askAudio.call(navigator.mediaDevices, { audio: true });
      probe.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      setAudioSetupUnlocked(true);
      await refreshAudioDevices(true);
    } catch { recorder.setError('Não consegui acessar os microfones. Permita o microfone no navegador para escolher a entrada de áudio.'); }
    finally { setIsLoadingDevices(false); }
  }
  function resetLocalState() {
    recorder.setPreviewUrl(null); recorder.setVisualUrl(null); recorder.setAudioReady(false); recorder.setError(''); recorder.chunksRef.current = []; recorder.visualChunksRef.current = []; recorder.micChunksRef.current = []; recorder.referenceChunksRef.current = []; recorder.finalBlobRef.current = null; recorder.visualBlobRef.current = null; recorder.voiceBlobRef.current = null; recorder.referenceBlobRef.current = null; premiumRenderCacheRef.current = null; setCaption(''); setPostCommunity(!canSendForReview); setSendForReview(canSendForReview); setPostedCommunityHref(''); setPostedSummary('Seu dueto foi processado conforme as opções escolhidas.'); setShowMixer(false); setRenderStatus(''); setPublishProgress(0); setIsAutoMixing(false); setAutoMixMessage(''); setRecordingSeconds(0); setIsPreviewingBase(false);
  }
  async function previewBase() {
    const reference = recorder.referenceRef.current;
    if (!reference || !referenceSource) return recorder.setError('Essa atividade ainda não tem vídeo de referência vinculado.');
    try {
      if (isPreviewingBase) { reference.pause(); setIsPreviewingBase(false); return; }
      reference.crossOrigin = 'anonymous'; reference.muted = false; reference.playsInline = true; reference.preload = 'auto'; reference.src = referenceSource; reference.currentTime = 0;
      await reference.play(); setIsPreviewingBase(true);
      window.setTimeout(() => { reference.pause(); setIsPreviewingBase(false); }, 12000);
    } catch { recorder.setError('Toque novamente para liberar o áudio da base no navegador.'); }
  }
  function toggleCameraFacing() { setCameraFacing((value) => value === 'user' ? 'environment' : 'user'); }
  async function startCountdown() {
    resetLocalState(); recorder.cleanup();
    if (!recorder.canRecord) return recorder.setError('Seu navegador não liberou câmera/microfone. Tente pelo Chrome ou Safari atualizado.');
    if (!referenceSource) return recorder.setError('Essa atividade ainda não tem vídeo de referência vinculado.');
    recorder.setStep('loading');
    try {
      const reference = recorder.referenceRef.current;
      if (!reference) throw new Error('missing_reference');
      reference.crossOrigin = 'anonymous'; reference.muted = true; reference.playsInline = true; reference.preload = 'auto'; reference.load();
      await recorder.waitReady(reference);
      const stream = await prepareDuetCamera(recorder.cameraRef.current, { audioDeviceId: selectedAudioDeviceId || undefined, micMode, facingMode: cameraFacing });
      recorder.streamRef.current = stream;
      setAudioSetupUnlocked(true); refreshAudioDevices(false).catch(() => undefined); recorder.drawFrame(); recorder.setStep('countdown');
      let next = 3; recorder.setCount(next);
      const timer = window.setInterval(() => { next -= 1; if (next <= 0) { window.clearInterval(timer); beginRecording(stream); } else recorder.setCount(next); }, 1000);
    } catch { recorder.setStep('intro'); recorder.setError('O vídeo ou a câmera não carregaram. Feche a aba, abra novamente e permita câmera/microfone.'); }
  }
  async function beginRecording(stream: MediaStream) {
    const canvas = recorder.canvasRef.current, reference = recorder.referenceRef.current, camera = recorder.cameraRef.current;
    if (!canvas || !reference || !camera) return;
    recorder.chunksRef.current = []; recorder.visualChunksRef.current = []; recorder.micChunksRef.current = []; recorder.referenceChunksRef.current = [];
    const safari = isSafariLike();
    canvas.width = safari ? 960 : quality === '1080p' ? 1920 : 1280; canvas.height = safari ? 540 : quality === '1080p' ? 1080 : 720;
    try { await camera.play(); reference.pause(); reference.currentTime = 0; reference.muted = false; await reference.play(); recorder.startDraw(); }
    catch { recorder.setStep('intro'); recorder.setError('O navegador bloqueou o início do dueto. Toque novamente em iniciar.'); return; }
    const canvasStream = canvas.captureStream(safari ? 24 : 30);
    recorder.visualRecorderRef.current = startDuetRecorder(new MediaStream(canvasStream.getVideoTracks()), recorder.visualChunksRef.current, 'video');
    recorder.micRecorderRef.current = startDuetRecorder(new MediaStream(stream.getAudioTracks()), recorder.micChunksRef.current, 'audio');
    const monitor = buildDuetMonitorAudio(reference, stream);
    const tracks = Array.isArray(monitor) ? monitor : monitor.tracks;
    if (!Array.isArray(monitor)) { recorder.audioCtxRef.current = monitor.context; if (monitor.referenceTracks?.length) recorder.referenceRecorderRef.current = startDuetRecorder(new MediaStream(monitor.referenceTracks), recorder.referenceChunksRef.current, 'audio'); }
    const mixedStream = new MediaStream([...canvasStream.getVideoTracks(), ...tracks]);
    const mixedRecorder = startDuetRecorder(mixedStream, recorder.chunksRef.current, 'mixed');
    recorder.mediaRecorderRef.current = mixedRecorder; mixedRecorder.onstop = () => finishRecording(stream, mixedRecorder);
    reference.onended = () => { if (recorder.mediaRecorderRef.current?.state === 'recording') recorder.mediaRecorderRef.current.stop(); };
    recorder.setStep('recording');
  }
  function finishRecording(stream: MediaStream, mediaRecorder: MediaRecorder) {
    recorder.clearDraw(); recorder.referenceRef.current?.pause(); recorder.audioCtxRef.current?.close().catch(() => undefined);
    try { if (recorder.visualRecorderRef.current?.state === 'recording') recorder.visualRecorderRef.current.stop(); } catch {}
    try { if (recorder.micRecorderRef.current?.state === 'recording') recorder.micRecorderRef.current.stop(); } catch {}
    try { if (recorder.referenceRecorderRef.current?.state === 'recording') recorder.referenceRecorderRef.current.stop(); } catch {}
    const blob = new Blob(recorder.chunksRef.current, { type: mediaRecorder.mimeType || 'video/webm' });
    recorder.finalBlobRef.current = blob; recorder.setPreviewUrl(URL.createObjectURL(blob)); stream.getTracks().forEach((track) => track.stop());
    window.setTimeout(() => {
      if (recorder.visualChunksRef.current.length && recorder.micChunksRef.current.length) {
        const visualBlob = new Blob(recorder.visualChunksRef.current, { type: recorder.visualRecorderRef.current?.mimeType || 'video/webm' });
        const voiceBlob = new Blob(recorder.micChunksRef.current, { type: recorder.micRecorderRef.current?.mimeType || 'audio/webm' });
        const referenceBlob = recorder.referenceChunksRef.current.length ? new Blob(recorder.referenceChunksRef.current, { type: recorder.referenceRecorderRef.current?.mimeType || 'audio/webm' }) : null;
        recorder.visualBlobRef.current = visualBlob; recorder.voiceBlobRef.current = voiceBlob; recorder.referenceBlobRef.current = referenceBlob; recorder.setVisualUrl(URL.createObjectURL(visualBlob));
        recorder.prepareEngine(voiceBlob, referenceBlob).then(() => applyAutoMix(true)).catch(() => recorder.setError('O motor ao vivo não conseguiu preparar os áudios gravados. A prévia original ainda pode ser enviada.'));
      }
    }, 900);
    recorder.setStep('review');
  }
  function stopRecording() { recorder.mediaRecorderRef.current?.stop(); }
  function reset() { recorder.cleanup(); resetLocalState(); recorder.setStep('intro'); }
  async function togglePlayback() { await recorder.togglePlayback(); }
  async function handlePrimaryRecordAction() { if (isRecording) return stopRecording(); if (hasRecording) return reset(); return startCountdown(); }
  async function handleLeftAction() { if (hasRecording) return togglePlayback(); return previewBase(); }
  async function applyAutoMix(isInitial = false) {
    const voiceBlob = recorder.voiceBlobRef.current, referenceBlob = recorder.referenceBlobRef.current;
    if (!voiceBlob || (!referenceBlob && !referenceSource)) return;
    setIsAutoMixing(true); setAutoMixMessage(isInitial ? 'Analisando sua voz e a referência...' : 'Analisando áudio...');
    try {
      const result = await calculateDuetAutoMix({ voiceBlob, referenceBlob, referenceSource, currentPreset: recorder.preset });
      recorder.setVoiceVolume(result.voiceVolume); recorder.setReferenceVolume(result.referenceVolume); recorder.setPreset(result.preset); premiumRenderCacheRef.current = null; setAutoMixMessage(result.message); if (!isInitial) setShowMixer(true);
    } catch { setAutoMixMessage(isInitial ? '' : 'Não consegui analisar automaticamente. Ajuste manualmente.'); } finally { setIsAutoMixing(false); }
  }
  async function renderMixBlob(timeoutMs: number) {
    const visualBlob = recorder.visualBlobRef.current, voiceBlob = recorder.voiceBlobRef.current, referenceBlob = recorder.referenceBlobRef.current;
    if (!visualBlob || !voiceBlob || (!referenceBlob && !referenceSource)) return null;
    const signature = mixSignature(), cached = premiumRenderCacheRef.current?.signature === signature ? premiumRenderCacheRef.current.blob : null;
    if (cached) return cached;
    const rendered = await Promise.race([renderFinalDuetVideo({ visualBlob, voiceBlob, referenceBlob, referenceSource, settings: recorder.settings() }), new Promise<Blob>((_, reject) => window.setTimeout(() => reject(new Error('render_timeout')), timeoutMs))]);
    if (rendered && rendered.size >= 1000) premiumRenderCacheRef.current = { signature, blob: rendered };
    return rendered;
  }
  async function renderPremiumInBackground(submissionId: string) {
    if (!submissionId || !needsPremiumRender()) return setRenderStatus('');
    setRenderStatus('Publicado. Refinando apenas os ajustes de mix...');
    try {
      const rendered = await renderMixBlob(BACKGROUND_RENDER_TIMEOUT_MS);
      if (!rendered || rendered.size < 1000) return;
      const fileType = rendered.type || 'video/webm', data = new FormData();
      data.set('submission_id', submissionId); data.set('file', new File([rendered], `${lessonSlug}-dueto-premium.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      await fetch('/api/submissions/duet/premium', { method: 'POST', body: data });
    } catch {} finally { setRenderStatus(''); }
  }
  async function uploadBlobForSubmit(postToCommunity: boolean) {
    const fallback = recorder.finalBlobRef.current;
    if (!postToCommunity) return fallback;
    if (!fallback) return null;
    setPublishProgress(10); setRenderStatus('Preparando vídeo completo para a comunidade...');
    try { const rendered = await renderMixBlob(PUBLISH_RENDER_TIMEOUT_MS); if (rendered?.size && rendered.size >= 1000) return rendered; } catch {}
    return fallback;
  }
  function startProgressTicker() { const timer = window.setInterval(() => setPublishProgress((value) => value >= 92 ? value : value + 2), 550); return () => window.clearInterval(timer); }
  async function submitDuet(finalCaption: string, options: SubmitOptions) {
    const safeOptions = { postToCommunity: options.postToCommunity, sendForReview: canSendForReview && options.sendForReview };
    if (!safeOptions.postToCommunity && !safeOptions.sendForReview) { recorder.setError(canSendForReview ? 'Escolha se deseja postar na comunidade, enviar para avaliação ou fazer os dois.' : 'No modo gratuito você pode postar seu dueto na comunidade. Avaliação do professor é exclusiva para assinantes VIP.'); return; }
    recorder.setIsSubmitting(true); recorder.setError(''); setPublishProgress(safeOptions.postToCommunity ? 5 : 15); setRenderStatus(safeOptions.postToCommunity ? 'Preparando publicação...' : 'Enviando para avaliação...');
    const stopTicker = startProgressTicker();
    const blob = await uploadBlobForSubmit(safeOptions.postToCommunity);
    if (!blob) { stopTicker(); recorder.setIsSubmitting(false); setRenderStatus(''); setPublishProgress(0); recorder.setError('Grave o dueto antes de enviar.'); return; }
    try {
      const data = new FormData(), fileType = blob.type || 'video/webm';
      data.set('lesson_slug', lessonSlug); data.set('caption', finalCaption); data.set('visibility', safeOptions.postToCommunity ? 'community' : 'private'); data.set('review_requested', String(safeOptions.sendForReview)); data.set('voice_volume', String(recorder.voiceVolume)); data.set('reference_volume', String(recorder.referenceVolume)); data.set('voice_preset', recorder.preset); data.set('noise_reduction', String(recorder.noiseReduction)); data.set('file', new File([blob], `${lessonSlug}-dueto.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      setRenderStatus(safeOptions.postToCommunity && safeOptions.sendForReview ? 'Publicando e enviando para avaliação...' : safeOptions.postToCommunity ? 'Publicando na comunidade...' : 'Enviando atividade...');
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) { const json = await response.json().catch(() => null); throw new Error(json?.detail || json?.message || 'Não consegui enviar sua atividade.'); }
      const json = await response.json().catch(() => null), submissionId = String(json?.id || ''), communityPostId = String(json?.community_post_id || '');
      stopTicker(); setPublishProgress(100); recorder.setIsSubmitting(false); setRenderStatus(''); setPostedCommunityHref(safeOptions.postToCommunity ? `/aluno/comunidade${communityPostId ? `#post-${communityPostId}` : ''}` : ''); setPostedSummary(safeOptions.postToCommunity && safeOptions.sendForReview ? 'Publicado na comunidade e enviado para avaliação.' : safeOptions.postToCommunity ? 'Publicado na comunidade.' : 'Enviado para avaliação.'); recorder.setStep('posted');
      if (submissionId && safeOptions.sendForReview && !safeOptions.postToCommunity) void renderPremiumInBackground(submissionId);
    } catch (error: any) { stopTicker(); recorder.setIsSubmitting(false); setRenderStatus(''); setPublishProgress(0); recorder.setError(error?.message || 'Não consegui enviar sua atividade.'); }
  }
  function continuePublish() {
    const options = { postToCommunity: postCommunity, sendForReview: canSendForReview && sendForReview };
    if (!options.postToCommunity && !options.sendForReview) return recorder.setError(canSendForReview ? 'Marque pelo menos uma opção para continuar.' : 'No modo gratuito, marque Postar na comunidade para continuar.');
    if (options.postToCommunity) return recorder.setStep('caption');
    return submitDuet('', options);
  }
  function finalButtonText() { if (postCommunity && sendForReview && canSendForReview) return 'Publicar e enviar'; if (postCommunity) return 'Publicar vídeo'; if (sendForReview && canSendForReview) return 'Enviar para avaliação'; return 'Escolha uma opção'; }

  return <div className="duet-recording-premium">
    <style dangerouslySetInnerHTML={{ __html: duetCss }} />
    <header className="duet-premium-top"><a href={`/aluno/aula/${lessonSlug}`}><span>←</span> Voltar para a aula</a>{isRecording ? <button type="button" onClick={stopRecording}>Finalizar gravação</button> : <button type="button" onClick={() => recorder.previewUrl && recorder.setStep('review')} disabled={!recorder.previewUrl}>Assistir gravação</button>}</header>
    <section className="duet-hero-card"><div className="duet-hero-copy"><p>Atividade prática</p><h1>Grave seu dueto</h1><span>Aula: {lessonTitle}</span></div><div className="duet-hero-mic">🎙️</div><div className="duet-hero-tips"><div><Headphones size={28} /><span><strong>Use fone de ouvido</strong><small>Isso garante melhor captação da sua voz e performance.</small></span></div><button type="button" onClick={() => !canSendForReview && setShowVipModal(true)}><Crown size={28} /><span><strong>{canSendForReview ? 'Modo VIP' : 'Modo gratuito'}</strong><small>{canSendForReview ? 'Grave e envie para avaliação.' : 'Grave duetos e poste na comunidade.'}</small></span><b>›</b></button></div></section>
    {recorder.error ? <p className="duet-premium-error">{recorder.error}</p> : null}
    <p className="duet-section-label">Sua tela de gravação</p>
    <section className="duet-video-stage">
      <video ref={recorder.referenceRef} className="duet-hidden-source" src={referenceSource} crossOrigin="anonymous" playsInline muted preload="auto" />
      <video ref={recorder.cameraRef} className="duet-hidden-source" autoPlay muted playsInline />
      {recorder.previewUrl ? <><video ref={recorder.previewRef} className="duet-final-video" src={recorder.visualUrl || recorder.previewUrl} playsInline muted={Boolean(recorder.visualUrl)} controls={!recorder.visualUrl} onLoadedMetadata={() => recorder.engineRef.current?.setVideo(recorder.previewRef.current)} onEnded={() => { recorder.engineRef.current?.pause(false, true); recorder.setIsPlaying(false); }} />{recorder.visualUrl ? <button type="button" className="duet-stage-play" onClick={togglePlayback}>{recorder.isPlaying ? <Pause size={38} fill="currentColor" /> : <Play size={42} fill="currentColor" />}</button> : null}</> : <canvas ref={recorder.canvasRef} className="duet-canvas" width={1280} height={720} />}
      {recorder.step === 'intro' ? <div className="duet-empty-stage"><img src={PLACEHOLDER_SRC} alt="Prévia do dueto" /><div><Video size={42} /><p>O vídeo do seu dueto<br />aparecerá aqui</p></div></div> : null}
      {recorder.step === 'loading' ? <div className="duet-stage-overlay"><span>Preparando vídeo, câmera e microfone...</span></div> : null}
      {recorder.step === 'countdown' ? <div className="duet-countdown">{recorder.count}</div> : null}
      {isRecording ? <div className="duet-stage-overlay recording"><span>● Gravando... {formatDuration(recordingSeconds)}</span></div> : null}
      {recorder.step === 'review' ? <div className="duet-video-chip"><Music2 size={16} /> {lessonTitle}</div> : null}
    </section>
    <section className="duet-action-console sticky-actions"><button type="button" onClick={handleLeftAction} disabled={recorder.step === 'loading' || recorder.step === 'countdown'}>{hasRecording ? (recorder.isPlaying ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />) : <Play size={27} fill="currentColor" />}<span>{hasRecording ? (recorder.isPlaying ? 'Pausar gravação' : 'Assistir') : (isPreviewingBase ? 'Pausar base' : 'Ouvir base')}</span></button><button type="button" className="record-main" onClick={handlePrimaryRecordAction} disabled={recorder.step === 'loading' || recorder.step === 'countdown' || recorder.step === 'caption' || recorder.step === 'posted'}>{hasRecording && !isRecording ? <RefreshCcw size={30} /> : <Video size={30} fill="currentColor" />}<strong>{isRecording ? 'Finalizar' : recorder.step === 'loading' ? 'Preparando...' : hasRecording ? 'Regravar' : 'Iniciar gravação'}</strong><small>{isRecording ? 'Toque para finalizar' : hasRecording ? 'Grave outra versão' : 'Toque para começar'}</small></button><button type="button" onClick={toggleCameraFacing}><RotateCw size={27} /><span>Virar câmera</span></button></section>
    <section className="duet-duration-line"><span>◷ Duração máxima: 05:00</span><i><b style={{ width: `${progress}%` }} /></i><span>{formatDuration(recordingSeconds)}</span></section>
    <p className="duet-section-label">Controles da gravação</p>
    <section className="duet-control-grid"><button type="button" onClick={toggleCameraFacing}><Camera size={22} /><strong>Câmera</strong><small>{cameraFacing === 'user' ? 'Frontal' : 'Traseira'}</small><ChevronDown size={18} /></button><button type="button" onClick={() => setQuality((value) => value === '1080p' ? '720p' : '1080p')}><Video size={22} /><strong>Qualidade</strong><small>{quality}</small><ChevronDown size={18} /></button><button type="button" onClick={audioSetupUnlocked ? () => refreshAudioDevices(true) : unlockAudioSetup} disabled={isLoadingDevices}><Mic size={22} /><strong>Áudio</strong><small>{selectedAudioDevice ? selectedAudioDevice.label.replace(/\s*\([^)]*\)/g, '').slice(0, 20) : 'Microfone padrão'}</small><ChevronDown size={18} /></button><button type="button" onClick={() => setShowTips((value) => !value)}><CircleHelp size={22} /><strong>Dicas</strong><small>{showTips ? 'Ocultar dicas' : 'Ver dicas'}</small><ChevronDown size={18} /></button></section>
    {showTips || showBluetoothWarning ? <section className="duet-tips-panel"><p><Headphones size={18} /> Use fone para ouvir a base sem vazar no microfone.</p><p><Mic size={18} /> {deviceHint(selectedAudioDevice)} {audioSetupUnlocked ? '' : 'Toque em Áudio para liberar os nomes dos microfones.'}</p>{showBluetoothWarning ? <p className="warning"><AlertTriangle size={18} /> Bluetooth pode gerar atraso. Para duetos mais precisos, use fone com fio ou grave pelo microfone do celular.</p> : null}</section> : null}
    {renderStatus && recorder.step !== 'posted' ? <div className="duet-publish-progress"><p>{renderStatus}</p><div><span style={{ width: `${Math.max(4, publishProgress)}%` }} /></div><small>{Math.min(100, Math.max(0, publishProgress))}%</small></div> : null}
    {recorder.step === 'review' ? <div className="duet-after-record-actions"><button type="button" onClick={() => setShowMixer((value) => !value)} disabled={recorder.isSubmitting}><SlidersHorizontal size={16} /> {showMixer ? 'Ocultar mixagem' : 'Editar mixagem'}</button></div> : null}
    {recorder.step === 'review' && showMixer ? <DuetMixerPanel voiceVolume={recorder.voiceVolume} referenceVolume={recorder.referenceVolume} preset={recorder.preset as VoicePreset} canLiveEdit={recorder.canLiveEdit} latencyMs={recorder.latencyMs} noiseReduction={recorder.noiseReduction} isAutoMixing={isAutoMixing} autoMixMessage={autoMixMessage} onAutoMix={() => applyAutoMix(false)} onVoiceChange={recorder.setVoiceVolume} onReferenceChange={recorder.setReferenceVolume} onPresetChange={recorder.setPreset} onLatencyChange={recorder.setLatencyMs} onNoiseReductionChange={recorder.setNoiseReduction} onReset={() => { recorder.setVoiceVolume(DEFAULT_VOICE_VOLUME); recorder.setReferenceVolume(DEFAULT_REFERENCE_VOLUME); recorder.setPreset(DEFAULT_PRESET); recorder.setNoiseReduction(false); recorder.setLatencyMs(estimateDuetLatencyMs(selectedAudioDevice?.label)); setAutoMixMessage(''); }} /> : null}
    {recorder.step === 'review' ? <section className="duet-publish-card"><h2>Como deseja publicar?</h2><p>{canSendForReview ? 'Marque uma opção ou as duas. Você decide o destino do vídeo.' : 'No acesso gratuito, você pode publicar seu dueto na comunidade.'}</p><label className={postCommunity ? 'active' : ''}><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} disabled={recorder.isSubmitting} /><Users size={22} /><span><strong>Postar na comunidade</strong><small>Seu vídeo ficará visível para a galera.</small></span></label><label className={sendForReview && canSendForReview ? 'active' : ''} onClick={(event) => { if (!canSendForReview) { event.preventDefault(); setShowVipModal(true); } }}><input type="checkbox" checked={sendForReview && canSendForReview} onChange={(event) => setSendForReview(event.target.checked)} disabled={recorder.isSubmitting || !canSendForReview} /><CheckCircle2 size={22} /><span><strong>Enviar para avaliação</strong><small>{canSendForReview ? 'Receba feedback técnico do professor.' : 'Exclusivo para assinantes VIP.'}</small></span></label><button onClick={continuePublish} disabled={recorder.isSubmitting || !hasPublishChoice}><UploadCloud size={18} /> {recorder.isSubmitting ? (renderStatus || 'Enviando...') : finalButtonText()}</button></section> : null}
    {recorder.step === 'caption' ? <section className="duet-caption-card"><h2>Legenda da comunidade</h2><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda para o feed..." /><div><button type="button" onClick={() => recorder.setStep('review')} disabled={recorder.isSubmitting}>Voltar</button><button onClick={() => submitDuet(caption || 'Minha prática do dueto.', { postToCommunity: true, sendForReview })} disabled={recorder.isSubmitting}>{recorder.isSubmitting ? (renderStatus || 'Publicando...') : finalButtonText()}</button></div></section> : null}
    {recorder.step === 'posted' ? <section className="duet-posted-card"><CheckCircle2 size={34} /><div><h2>Vídeo enviado</h2><p>{postedSummary}</p><div>{postedCommunityHref ? <a href={postedCommunityHref}>Ver postagem</a> : null}<a href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></div></section> : null}
    {showVipModal ? <div className="vip-lock-backdrop" onClick={() => setShowVipModal(false)}><section className="vip-lock-modal" onClick={(event) => event.stopPropagation()}><button className="vip-lock-close" type="button" onClick={() => setShowVipModal(false)}><X size={22} /></button><div className="vip-lock-icon"><Lock size={30} /></div><p className="eyebrow"><Sparkles size={14} /> Avaliação VIP</p><h3>Receba uma avaliação individual do professor</h3><p>Seu dueto já pode ir para a comunidade. Como assinante VIP, você também envia para análise técnica personalizada.</p><a className="vip-lock-cta" href={VIP_CHECKOUT_URL}>Quero ser VIP</a><button className="vip-lock-later" type="button" onClick={() => setShowVipModal(false)}>Continuar grátis</button></section></div> : null}
  </div>;
}

const duetCss = `.duet-recording-premium{min-height:100dvh;margin:-24px -16px 0;padding:calc(24px + env(safe-area-inset-top)) 15px calc(18px + env(safe-area-inset-bottom));background:radial-gradient(circle at 74% 7%,rgba(245,199,107,.10),transparent 23%),linear-gradient(180deg,#111418 0%,#050608 48%,#020304 100%);color:#fff}.duet-premium-top{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:820px;margin:0 auto 18px}.duet-premium-top a,.duet-premium-top button{border:0;background:transparent;color:#fff;text-decoration:none;font-weight:900;font-size:15px;display:flex;align-items:center;gap:8px}.duet-premium-top a span{font-size:28px}.duet-premium-top button{color:#f5c76b}.duet-premium-top button:disabled{opacity:.35}.duet-hero-card,.duet-video-stage,.duet-action-console,.duet-duration-line,.duet-tips-panel,.duet-publish-card,.duet-caption-card,.duet-posted-card,.duet-after-record-actions,.duet-publish-progress{max-width:820px;margin-left:auto;margin-right:auto}.duet-hero-card{position:relative;overflow:hidden;border:1px solid rgba(245,199,107,.26);border-radius:24px;padding:26px 28px 18px;background:radial-gradient(circle at 84% 24%,rgba(245,199,107,.18),transparent 31%),linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018));box-shadow:0 24px 80px rgba(0,0,0,.28)}.duet-hero-copy{position:relative;z-index:2}.duet-hero-copy p,.duet-section-label{color:#f5c76b;text-transform:uppercase;letter-spacing:.22em;font-weight:950;font-size:13px}.duet-hero-copy h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(38px,7vw,58px);line-height:1;margin:18px 0 14px;letter-spacing:-.05em}.duet-hero-copy span{font-size:18px;color:rgba(255,255,255,.75)}.duet-hero-mic{position:absolute;right:58px;top:16px;font-size:126px;filter:sepia(1) saturate(1.8) drop-shadow(0 0 34px rgba(245,199,107,.28));opacity:.88}.duet-hero-tips{position:relative;z-index:2;margin-top:50px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.duet-hero-tips>div,.duet-hero-tips>button{min-height:76px;text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.045);color:#fff;padding:14px 16px;display:grid;grid-template-columns:42px minmax(0,1fr) 16px;gap:12px;align-items:center;overflow:hidden}.duet-hero-tips>div{grid-template-columns:42px minmax(0,1fr)}.duet-hero-tips svg{color:#f5c76b}.duet-hero-tips strong{display:block;color:#f5c76b;font-size:16px}.duet-hero-tips small{display:block;margin-top:5px;color:rgba(255,255,255,.68);line-height:1.32}.duet-section-label{max-width:820px;margin:24px auto 12px}.duet-video-stage{position:relative;aspect-ratio:16/10.3;border:1px solid rgba(245,199,107,.62);border-radius:23px;background:#020304;overflow:hidden;box-shadow:inset 0 0 60px rgba(0,0,0,.65),0 18px 70px rgba(0,0,0,.28)}.duet-hidden-source{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.duet-canvas,.duet-final-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#020304}.duet-empty-stage{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:rgba(255,255,255,.52);font-size:17px;background:#020304}.duet-empty-stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.78}.duet-empty-stage:after{content:'';position:absolute;inset:0;background:radial-gradient(circle at center,rgba(0,0,0,.16),rgba(0,0,0,.62))}.duet-empty-stage>div{position:relative;z-index:2}.duet-empty-stage svg{margin:0 auto 16px;color:rgba(255,255,255,.55)}.duet-stage-overlay,.duet-countdown{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:rgba(255,255,255,.52);font-size:17px}.duet-stage-overlay span{border:1px solid rgba(245,199,107,.25);border-radius:999px;background:rgba(0,0,0,.62);color:#f5c76b;padding:10px 16px;font-weight:900}.duet-stage-overlay.recording span{color:#ff6565;border-color:rgba(255,101,101,.34)}.duet-countdown{font-size:110px;color:#f5c76b;text-shadow:0 0 45px rgba(245,199,107,.62);background:rgba(0,0,0,.45)}.duet-stage-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:82px;height:82px;border-radius:50%;border:2px solid rgba(255,255,255,.84);background:rgba(0,0,0,.35);color:#fff}.duet-video-chip{position:absolute;left:18px;bottom:18px;border-radius:999px;background:rgba(0,0,0,.58);border:1px solid rgba(245,199,107,.22);padding:9px 13px;display:flex;gap:8px;align-items:center;color:#f5c76b;font-weight:850}.duet-action-console{border:1px solid rgba(255,255,255,.09);border-radius:21px;background:linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018));padding:16px 18px;display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:16px;align-items:center;margin-top:14px;margin-bottom:14px}.duet-action-console button{border:0;background:transparent;color:#fff;min-height:94px;border-radius:18px;display:grid;place-items:center;gap:8px;font-weight:800}.duet-action-console button:disabled{opacity:.38}.duet-action-console svg{color:#f5c76b}.duet-action-console span{color:rgba(255,255,255,.76);font-size:14px}.duet-action-console .record-main{background:radial-gradient(circle at 50% 35%,rgba(245,199,107,.2),rgba(255,255,255,.035));border:1px solid rgba(245,199,107,.28);box-shadow:0 0 30px rgba(245,199,107,.10)}.duet-action-console .record-main svg{width:58px;height:58px;border-radius:50%;border:2px solid #f5c76b;padding:14px}.duet-action-console .record-main strong{color:#f5c76b;font-size:19px}.duet-action-console .record-main small{color:rgba(255,255,255,.62);font-size:13px}.duet-duration-line{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:12px 14px;color:rgba(255,255,255,.72);margin-bottom:18px}.duet-duration-line i{height:8px;background:rgba(255,255,255,.1);border-radius:999px;overflow:hidden}.duet-duration-line b{display:block;height:100%;background:#f5c76b}.duet-control-grid{max-width:820px;margin:0 auto 22px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.duet-control-grid button{position:relative;min-height:70px;border:1px solid rgba(245,199,107,.22);border-radius:15px;background:linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.02));color:#fff;text-align:left;padding:14px 30px 12px 16px}.duet-control-grid svg{color:#f5c76b}.duet-control-grid strong{display:block;margin-top:7px;color:#f5c76b;font-size:15px}.duet-control-grid small{display:block;margin-top:7px;color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.duet-control-grid button>svg:last-child{position:absolute;right:10px;bottom:15px}.duet-tips-panel{border:1px solid rgba(255,255,255,.10);border-radius:16px;background:rgba(255,255,255,.04);padding:14px 16px;margin-bottom:18px;color:rgba(255,255,255,.72)}.duet-tips-panel p{display:flex;gap:10px;align-items:flex-start;margin:8px 0}.duet-tips-panel svg{color:#f5c76b;flex:0 0 auto}.duet-tips-panel .warning{color:#ffd98c}.duet-premium-error{max-width:820px;margin:14px auto;border:1px solid rgba(255,101,101,.25);background:rgba(255,101,101,.08);color:#ffb5b5;border-radius:14px;padding:12px 14px}.duet-after-record-actions{display:flex;gap:10px;justify-content:center;margin:12px auto}.duet-after-record-actions button{border:1px solid rgba(245,199,107,.24);border-radius:999px;background:rgba(255,255,255,.04);color:#f5c76b;padding:10px 14px;display:flex;gap:8px;align-items:center;font-weight:800}.duet-publish-card,.duet-caption-card,.duet-posted-card{border:1px solid rgba(245,199,107,.24);border-radius:22px;background:rgba(255,255,255,.045);padding:18px;margin-top:16px}.duet-publish-card h2,.duet-caption-card h2,.duet-posted-card h2{margin:0 0 8px;color:#f5c76b}.duet-publish-card p{color:rgba(255,255,255,.72)}.duet-publish-card label{display:grid;grid-template-columns:20px 28px 1fr;gap:12px;align-items:center;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;margin:10px 0}.duet-publish-card label.active{border-color:rgba(245,199,107,.42);background:rgba(245,199,107,.08)}.duet-publish-card svg{color:#f5c76b}.duet-publish-card strong{display:block;color:#fff}.duet-publish-card small{color:rgba(255,255,255,.62)}.duet-publish-card>button,.duet-caption-card button,.vip-lock-cta{border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#111;font-weight:950;padding:14px 18px;text-decoration:none;display:inline-flex;gap:8px;align-items:center}.duet-publish-card>button:disabled,.duet-caption-card button:disabled{opacity:.5}.duet-caption-card textarea{width:100%;min-height:120px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35);color:#fff;padding:12px}.duet-caption-card div{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}.duet-posted-card{display:flex;gap:14px;align-items:flex-start}.duet-posted-card svg{color:#56d982}.duet-posted-card a{color:#f5c76b;margin-right:12px}.duet-publish-progress{border:1px solid rgba(245,199,107,.22);border-radius:14px;padding:12px;margin-top:14px}.duet-publish-progress p{margin:0 0 8px;color:#f5c76b}.duet-publish-progress div{height:8px;background:rgba(255,255,255,.1);border-radius:999px;overflow:hidden}.duet-publish-progress span{display:block;height:100%;background:#f5c76b}.vip-lock-backdrop{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:20px}.vip-lock-modal{max-width:380px;border:1px solid rgba(245,199,107,.28);border-radius:24px;background:#111;padding:24px;text-align:center;position:relative}.vip-lock-close{position:absolute;right:10px;top:10px;border:0;background:transparent;color:#fff}.vip-lock-icon{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;margin:0 auto 12px;background:rgba(245,199,107,.14);color:#f5c76b}.vip-lock-modal .eyebrow{color:#f5c76b;text-transform:uppercase;font-size:12px;font-weight:900}.vip-lock-modal h3{font-size:24px;margin:8px 0}.vip-lock-modal p{color:rgba(255,255,255,.72)}.vip-lock-later{border:0;background:transparent;color:rgba(255,255,255,.7);margin-top:12px}@media(max-width:620px){.duet-recording-premium{margin:-18px -14px 0;padding-left:0;padding-right:0}.duet-premium-top,.duet-hero-card,.duet-section-label,.duet-video-stage,.duet-action-console,.duet-duration-line,.duet-control-grid,.duet-tips-panel,.duet-publish-card,.duet-caption-card,.duet-posted-card,.duet-after-record-actions,.duet-publish-progress{max-width:none;margin-left:0;margin-right:0}.duet-premium-top{padding:0 14px}.duet-hero-card{border-left:0;border-right:0;border-radius:0 0 24px 24px}.duet-hero-mic{right:12px;font-size:96px}.duet-hero-tips{grid-template-columns:1fr 1fr}.duet-hero-tips>div,.duet-hero-tips>button{grid-template-columns:34px minmax(0,1fr);padding:12px}.duet-video-stage{border-radius:18px;aspect-ratio:16/11.2}.duet-action-console{grid-template-columns:1fr 1.2fr 1fr;border-left:0;border-right:0;border-radius:20px;padding:14px 10px}.duet-action-console button{min-height:82px}.duet-action-console .record-main strong{font-size:16px}.duet-action-console .record-main svg{width:52px;height:52px}.duet-control-grid{grid-template-columns:repeat(4,minmax(92px,1fr));overflow-x:auto;padding:0 0 6px}.duet-control-grid button{min-width:92px}.duet-section-label{padding-left:0}.duet-duration-line,.duet-tips-panel,.duet-publish-card,.duet-caption-card,.duet-posted-card,.duet-publish-progress{margin-left:0;margin-right:0}}`;
