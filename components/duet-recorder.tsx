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
  const [showPublishOptions, setShowPublishOptions] = useState(false);
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
  const useLiveMixPreview = Boolean(recorder.visualUrl && recorder.audioReady);
  const reviewPreviewSrc = useLiveMixPreview ? recorder.visualUrl : recorder.previewUrl;
  const canUseMixer = recorder.canLiveEdit && Boolean(referenceSource);

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
    recorder.setPreviewUrl(null); recorder.setVisualUrl(null); recorder.setAudioReady(false); recorder.setError(''); recorder.chunksRef.current = []; recorder.visualChunksRef.current = []; recorder.micChunksRef.current = []; recorder.referenceChunksRef.current = []; recorder.finalBlobRef.current = null; recorder.visualBlobRef.current = null; recorder.voiceBlobRef.current = null; recorder.referenceBlobRef.current = null; premiumRenderCacheRef.current = null; setCaption(''); setPostCommunity(!canSendForReview); setSendForReview(canSendForReview); setPostedCommunityHref(''); setPostedSummary('Seu dueto foi processado conforme as opções escolhidas.'); setShowMixer(false); setShowPublishOptions(false); setRenderStatus(''); setPublishProgress(0); setIsAutoMixing(false); setAutoMixMessage(''); setRecordingSeconds(0); setIsPreviewingBase(false);
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
      recorder.streamRef.current = stream; setAudioSetupUnlocked(true); refreshAudioDevices(false).catch(() => undefined); recorder.drawFrame(); recorder.setStep('countdown');
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
    if (!Array.isArray(monitor)) {
      recorder.audioCtxRef.current = monitor.context;
      if (monitor.referenceTracks?.length) recorder.referenceRecorderRef.current = startDuetRecorder(new MediaStream(monitor.referenceTracks), recorder.referenceChunksRef.current, 'audio');
    }
    const mixedStream = new MediaStream([...canvasStream.getVideoTracks(), ...tracks]);
    const mixedRecorder = startDuetRecorder(mixedStream, recorder.chunksRef.current, 'mixed');
    recorder.mediaRecorderRef.current = mixedRecorder; mixedRecorder.onstop = () => finishRecording(stream, mixedRecorder);
    reference.onended = () => { if (recorder.mediaRecorderRef.current?.state === 'recording') recorder.mediaRecorderRef.current.stop(); };
    recorder.setStep('recording');
  }
  function finishRecording(stream: MediaStream, mediaRecorder: MediaRecorder) {
    recorder.clearDraw(); recorder.referenceRef.current?.pause();
    try { if (recorder.visualRecorderRef.current?.state === 'recording') recorder.visualRecorderRef.current.stop(); } catch {}
    try { if (recorder.micRecorderRef.current?.state === 'recording') recorder.micRecorderRef.current.stop(); } catch {}
    try { if (recorder.referenceRecorderRef.current?.state === 'recording') recorder.referenceRecorderRef.current.stop(); } catch {}
    const blob = new Blob(recorder.chunksRef.current, { type: mediaRecorder.mimeType || 'video/webm' });
    recorder.finalBlobRef.current = blob; recorder.setPreviewUrl(URL.createObjectURL(blob)); stream.getTracks().forEach((track) => track.stop());
    window.setTimeout(() => {
      recorder.audioCtxRef.current?.close().catch(() => undefined);
      if (recorder.visualChunksRef.current.length && recorder.micChunksRef.current.length) {
        const visualBlob = new Blob(recorder.visualChunksRef.current, { type: recorder.visualRecorderRef.current?.mimeType || 'video/webm' });
        const voiceBlob = new Blob(recorder.micChunksRef.current, { type: recorder.micRecorderRef.current?.mimeType || 'audio/webm' });
        const referenceBlob = recorder.referenceChunksRef.current.length ? new Blob(recorder.referenceChunksRef.current, { type: recorder.referenceRecorderRef.current?.mimeType || 'audio/webm' }) : null;
        recorder.visualBlobRef.current = visualBlob; recorder.voiceBlobRef.current = voiceBlob; recorder.referenceBlobRef.current = referenceBlob;
        recorder.prepareEngine(voiceBlob, referenceBlob).then(() => { recorder.setVisualUrl(URL.createObjectURL(visualBlob)); applyAutoMix(true); }).catch(() => { recorder.setVisualUrl(null); recorder.setAudioReady(false); setShowMixer(false); recorder.setError('A prévia está disponível. A mixagem ao vivo não foi liberada para esta gravação.'); });
      }
    }, 1200);
    setShowMixer(false); setShowPublishOptions(false); recorder.setStep('review');
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
    try { const rendered = await renderMixBlob(BACKGROUND_RENDER_TIMEOUT_MS); if (!rendered || rendered.size < 1000) return; const fileType = rendered.type || 'video/webm', data = new FormData(); data.set('submission_id', submissionId); data.set('file', new File([rendered], `${lessonSlug}-dueto-premium.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType })); await fetch('/api/submissions/duet/premium', { method: 'POST', body: data }); } catch {} finally { setRenderStatus(''); }
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
    const stopTicker = startProgressTicker(), blob = await uploadBlobForSubmit(safeOptions.postToCommunity);
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
    <section className="duet-video-stage"><video ref={recorder.referenceRef} className="duet-hidden-source" src={referenceSource} crossOrigin="anonymous" playsInline muted preload="auto" /><video ref={recorder.cameraRef} className="duet-hidden-source" autoPlay muted playsInline />{recorder.previewUrl ? <><video ref={recorder.previewRef} className="duet-final-video" src={reviewPreviewSrc || recorder.previewUrl} playsInline muted={useLiveMixPreview} controls={!useLiveMixPreview} onLoadedMetadata={() => recorder.engineRef.current?.setVideo(recorder.previewRef.current)} onEnded={() => { recorder.engineRef.current?.pause(false, true); recorder.setIsPlaying(false); }} />{useLiveMixPreview ? <button type="button" className="duet-stage-play" onClick={togglePlayback}>{recorder.isPlaying ? <Pause size={38} fill="currentColor" /> : <Play size={42} fill="currentColor" />}</button> : null}</> : <canvas ref={recorder.canvasRef} className="duet-canvas" width={1280} height={720} />}{recorder.step === 'intro' ? <div className="duet-empty-stage"><div><Video size={42} /><p>O vídeo do seu dueto<br />aparecerá aqui</p></div></div> : null}{recorder.step === 'loading' ? <div className="duet-stage-overlay"><span>Preparando vídeo, câmera e microfone...</span></div> : null}{recorder.step === 'countdown' ? <div className="duet-countdown">{recorder.count}</div> : null}{isRecording ? <div className="duet-stage-overlay recording"><span>● Gravando... {formatDuration(recordingSeconds)}</span></div> : null}{recorder.step === 'review' ? <div className="duet-video-chip"><Music2 size={16} /> {lessonTitle}</div> : null}</section>
    <p className="duet-section-label">Controles da gravação</p>
    <section className="duet-control-grid"><button type="button" onClick={toggleCameraFacing}><Camera size={22} /><strong>Câmera</strong><small>{cameraFacing === 'user' ? 'Frontal' : 'Traseira'}</small><ChevronDown size={18} /></button><button type="button" onClick={() => setQuality((value) => value === '1080p' ? '720p' : '1080p')}><Video size={22} /><strong>Qualidade</strong><small>{quality}</small><ChevronDown size={18} /></button><button type="button" onClick={audioSetupUnlocked ? () => refreshAudioDevices(true) : unlockAudioSetup} disabled={isLoadingDevices}><Mic size={22} /><strong>Áudio</strong><small>{selectedAudioDevice ? selectedAudioDevice.label.replace(/\s*\([^)]*\)/g, '').slice(0, 20) : 'Microfone padrão'}</small><ChevronDown size={18} /></button><button type="button" onClick={() => setShowTips((value) => !value)}><CircleHelp size={22} /><strong>Dicas</strong><small>{showTips ? 'Ocultar dicas' : 'Ver dicas'}</small><ChevronDown size={18} /></button></section>
    <section className="duet-action-console sticky-actions"><button type="button" onClick={handleLeftAction} disabled={recorder.step === 'loading' || recorder.step === 'countdown'}>{hasRecording ? (recorder.isPlaying ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />) : <Play size={27} fill="currentColor" />}<span>{hasRecording ? (recorder.isPlaying ? 'Pausar gravação' : 'Assistir') : (isPreviewingBase ? 'Pausar base' : 'Ouvir base')}</span></button><button type="button" className="record-main" onClick={handlePrimaryRecordAction} disabled={recorder.step === 'loading' || recorder.step === 'countdown' || recorder.step === 'caption' || recorder.step === 'posted'}>{hasRecording && !isRecording ? <RefreshCcw size={30} /> : <Video size={30} fill="currentColor" />}<strong>{isRecording ? 'Finalizar' : recorder.step === 'loading' ? 'Preparando...' : hasRecording ? 'Regravar' : 'Iniciar gravação'}</strong><small>{isRecording ? 'Toque para finalizar' : hasRecording ? 'Grave outra versão' : 'Toque para começar'}</small></button><button type="button" onClick={toggleCameraFacing}><RotateCw size={27} /><span>Virar câmera</span></button></section>
    <section className="duet-duration-line"><span>◷ Duração máxima: 05:00</span><i><b style={{ width: `${progress}%` }} /></i><span>{formatDuration(recordingSeconds)}</span></section>
    {showTips || showBluetoothWarning ? <section className="duet-tips-panel"><p><Headphones size={18} /> Use fone para ouvir a base sem vazar no microfone.</p><p><Mic size={18} /> {deviceHint(selectedAudioDevice)} {audioSetupUnlocked ? '' : 'Toque em Áudio para liberar os nomes dos microfones.'}</p>{showBluetoothWarning ? <p className="warning"><AlertTriangle size={18} /> Bluetooth pode gerar atraso. Para duetos mais precisos, use fone com fio ou grave pelo microfone do celular.</p> : null}</section> : null}
    {renderStatus && recorder.step !== 'posted' ? <div className="duet-publish-progress"><p>{renderStatus}</p><div><span style={{ width: `${Math.max(4, publishProgress)}%` }} /></div><small>{Math.min(100, Math.max(0, publishProgress))}%</small></div> : null}
    {recorder.step === 'review' ? <div className="duet-after-record-actions">{canUseMixer ? <button type="button" onClick={() => setShowMixer((value) => !value)} disabled={recorder.isSubmitting}><SlidersHorizontal size={16} /> {showMixer ? 'Ocultar mixagem' : 'Editar mixagem'}</button> : null}<button type="button" className="duet-continue-button" onClick={() => setShowPublishOptions(true)} disabled={recorder.isSubmitting}>Continuar</button></div> : null}
    {recorder.step === 'review' && showMixer && canUseMixer ? <DuetMixerPanel voiceVolume={recorder.voiceVolume} referenceVolume={recorder.referenceVolume} preset={recorder.preset as VoicePreset} canLiveEdit={canUseMixer} latencyMs={recorder.latencyMs} noiseReduction={recorder.noiseReduction} isAutoMixing={isAutoMixing} autoMixMessage={autoMixMessage} onAutoMix={() => applyAutoMix(false)} onVoiceChange={recorder.setVoiceVolume} onReferenceChange={recorder.setReferenceVolume} onPresetChange={recorder.setPreset} onLatencyChange={recorder.setLatencyMs} onNoiseReductionChange={recorder.setNoiseReduction} onReset={() => { recorder.setVoiceVolume(DEFAULT_VOICE_VOLUME); recorder.setReferenceVolume(DEFAULT_REFERENCE_VOLUME); recorder.setPreset(DEFAULT_PRESET); recorder.setNoiseReduction(false); recorder.setLatencyMs(estimateDuetLatencyMs(selectedAudioDevice?.label)); setAutoMixMessage(''); }} /> : null}
    {recorder.step === 'review' && showPublishOptions ? <section className="duet-publish-card"><h2>Como deseja publicar?</h2><p>{canSendForReview ? 'Marque uma ou as duas opções. Você pode postar na comunidade e também enviar para avaliação.' : 'No modo gratuito, a atividade pode ser publicada na comunidade. Avaliação individual é exclusiva para assinantes VIP.'}</p><label><input type="checkbox" checked={postCommunity} onChange={(e) => setPostCommunity(e.target.checked)} /> <span><Users size={18} /> Postar na comunidade</span></label><label className={!canSendForReview ? 'locked' : ''}><input type="checkbox" checked={sendForReview && canSendForReview} disabled={!canSendForReview} onChange={(e) => setSendForReview(e.target.checked)} /> <span>{canSendForReview ? <UploadCloud size={18} /> : <Lock size={18} />} Enviar para avaliação</span>{!canSendForReview ? <button type="button" onClick={() => setShowVipModal(true)}>Liberar VIP</button> : null}</label><button type="button" className="duet-submit-main" onClick={continuePublish} disabled={recorder.isSubmitting || !hasPublishChoice}>{recorder.isSubmitting ? 'Enviando...' : finalButtonText()}</button></section> : null}
    {recorder.step === 'caption' ? <div className="duet-caption-sheet"><button type="button" className="duet-sheet-close" onClick={() => recorder.setStep('review')}><X size={22} /></button><h2>Legenda do seu dueto</h2><textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Escreva uma legenda curta para a comunidade..." maxLength={220} /><button type="button" onClick={() => submitDuet(caption, { postToCommunity: postCommunity, sendForReview })} disabled={recorder.isSubmitting}>{recorder.isSubmitting ? 'Publicando...' : finalButtonText()}</button></div> : null}
    {recorder.step === 'posted' ? <section className="duet-posted-card"><CheckCircle2 size={46} /><h2>Dueto enviado!</h2><p>{postedSummary}</p>{postedCommunityHref ? <a href={postedCommunityHref}>Ver na comunidade</a> : null}<a href={`/aluno/aula/${lessonSlug}`}>Voltar para a aula</a></section> : null}
    {showVipModal ? <div className="duet-vip-modal"><section><button type="button" onClick={() => setShowVipModal(false)}><X size={22} /></button><Crown size={42} /><h2>Avaliação individual é VIP</h2><p>Assinantes podem enviar duetos para análise, receber orientação e acompanhar evolução.</p><a href={VIP_CHECKOUT_URL}>Assinar VIP</a></section></div> : null}
  </div>;
}

const duetCss = ``;
