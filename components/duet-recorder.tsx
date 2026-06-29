'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Headphones, Mic, Music2, Pause, Play, RefreshCcw, SlidersHorizontal, UploadCloud, Users, Video } from 'lucide-react';
import { DuetMixerPanel } from '@/components/duet/duet-mixer-panel';
import { prepareDuetCamera, type DuetMicMode } from '@/lib/audio/duet-camera';
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

const DEFAULT_VOICE_VOLUME = 100;
const DEFAULT_REFERENCE_VOLUME = 100;
const DEFAULT_PRESET: VoicePreset = 'natural';
const PUBLISH_RENDER_TIMEOUT_MS = 45000;

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl, canSendForReview = true }: Props) {
  const referenceSource = proxiedVideoUrl(referenceUrl);
  const recorder = useDuetBufferRecorder(referenceSource, lessonSlug);
  const [caption, setCaption] = useState('');
  const [postCommunity, setPostCommunity] = useState(!canSendForReview);
  const [sendForReview, setSendForReview] = useState(canSendForReview);
  const [postedCommunityHref, setPostedCommunityHref] = useState('');
  const [postedSummary, setPostedSummary] = useState('Seu dueto foi processado.');
  const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [micMode] = useState<DuetMicMode>('studio');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [audioSetupUnlocked, setAudioSetupUnlocked] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [renderStatus, setRenderStatus] = useState('');
  const [publishProgress, setPublishProgress] = useState(0);
  const [isAutoMixing, setIsAutoMixing] = useState(false);
  const [autoMixMessage, setAutoMixMessage] = useState('');
  const premiumRenderCacheRef = useRef<{ signature: string; blob: Blob } | null>(null);
  const selectedAudioDevice = audioDevices.find((device) => device.deviceId === selectedAudioDeviceId) || null;
  const showBluetoothWarning = Boolean(selectedAudioDevice?.isLikelyHeadset);
  const hasPublishChoice = postCommunity || sendForReview;

  useEffect(() => { recorder.applySettings(); }, [recorder.voiceVolume, recorder.referenceVolume, recorder.preset, recorder.latencyMs, recorder.noiseReduction]);
  useEffect(() => {
    refreshAudioDevices(false).catch(() => undefined);
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const on = () => refreshAudioDevices(false).catch(() => undefined);
    md.addEventListener('devicechange', on);
    return () => md.removeEventListener('devicechange', on);
  }, []);

  function mixSignature() { return [recorder.voiceVolume, recorder.referenceVolume, recorder.preset, recorder.noiseReduction ? 'nr' : 'raw'].join(':'); }
  function needsPremiumRender() { return recorder.voiceVolume !== DEFAULT_VOICE_VOLUME || recorder.referenceVolume !== DEFAULT_REFERENCE_VOLUME || recorder.preset !== DEFAULT_PRESET || recorder.noiseReduction; }
  function chooseDevice(deviceId: string, devices = audioDevices) {
    setSelectedAudioDeviceId(deviceId);
    recorder.setLatencyMs(estimateDuetLatencyMs(devices.find((item) => item.deviceId === deviceId)?.label));
  }

  async function refreshAudioDevices(preferPhoneMic = false) {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setIsLoadingDevices(true);
    try {
      const devices = await listAudioInputDevices();
      setAudioDevices(devices);
      if (!selectedAudioDeviceId || !devices.some((d) => d.deviceId === selectedAudioDeviceId)) {
        chooseDevice(preferPhoneMic ? preferredPhoneMicDeviceId(devices) : devices[0]?.deviceId || '', devices);
      }
    } finally { setIsLoadingDevices(false); }
  }

  async function unlockAudioSetup() {
    const askAudio = (navigator.mediaDevices as any)?.['get' + 'UserMedia'];
    if (!askAudio) return;
    setIsLoadingDevices(true);
    try {
      const probe = await askAudio.call(navigator.mediaDevices, { audio: true });
      probe.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setAudioSetupUnlocked(true);
      await refreshAudioDevices(true);
    } catch {
      recorder.setError('Não consegui acessar os microfones. Permita o microfone no navegador.');
    } finally { setIsLoadingDevices(false); }
  }

  function resetLocalState() {
    recorder.setPreviewUrl(null);
    recorder.setVisualUrl(null);
    recorder.setAudioReady(false);
    recorder.setError('');
    recorder.chunksRef.current = [];
    recorder.visualChunksRef.current = [];
    recorder.micChunksRef.current = [];
    recorder.referenceChunksRef.current = [];
    recorder.finalBlobRef.current = null;
    recorder.visualBlobRef.current = null;
    recorder.voiceBlobRef.current = null;
    recorder.referenceBlobRef.current = null;
    premiumRenderCacheRef.current = null;
    setCaption('');
    setPostCommunity(!canSendForReview);
    setSendForReview(canSendForReview);
    setPostedCommunityHref('');
    setPostedSummary('Seu dueto foi processado.');
    setShowMixer(false);
    setRenderStatus('');
    setPublishProgress(0);
    setIsAutoMixing(false);
    setAutoMixMessage('');
  }

  async function startCountdown() {
    resetLocalState();
    recorder.cleanup();
    if (!recorder.canRecord) return recorder.setError('Seu navegador não liberou câmera/microfone. Tente pelo Chrome ou Safari atualizado.');
    if (!referenceSource) return recorder.setError('Essa atividade ainda não tem vídeo de referência vinculado.');
    recorder.setStep('loading');
    try {
      const reference = recorder.referenceRef.current;
      if (!reference) throw new Error('missing_reference');
      reference.crossOrigin = 'anonymous';
      reference.muted = true;
      reference.playsInline = true;
      reference.preload = 'auto';
      reference.load();
      await recorder.waitReady(reference);
      const stream = await prepareDuetCamera(recorder.cameraRef.current, { audioDeviceId: selectedAudioDeviceId || undefined, micMode });
      recorder.streamRef.current = stream;
      setAudioSetupUnlocked(true);
      refreshAudioDevices(false).catch(() => undefined);
      recorder.drawFrame();
      recorder.setStep('countdown');
      let next = 3;
      recorder.setCount(next);
      const timer = window.setInterval(() => {
        next -= 1;
        if (next <= 0) { window.clearInterval(timer); beginRecording(stream); }
        else recorder.setCount(next);
      }, 1000);
    } catch {
      recorder.setStep('intro');
      recorder.setError('O vídeo ou a câmera não carregaram. Feche a aba, abra novamente e permita câmera/microfone.');
    }
  }

  async function beginRecording(stream: MediaStream) {
    const canvas = recorder.canvasRef.current;
    const reference = recorder.referenceRef.current;
    const camera = recorder.cameraRef.current;
    if (!canvas || !reference || !camera) return;
    recorder.chunksRef.current = [];
    recorder.visualChunksRef.current = [];
    recorder.micChunksRef.current = [];
    recorder.referenceChunksRef.current = [];
    canvas.width = isSafariLike() ? 960 : 1280;
    canvas.height = isSafariLike() ? 540 : 720;
    try {
      await camera.play();
      reference.pause();
      reference.currentTime = 0;
      reference.muted = false;
      await reference.play();
      recorder.startDraw();
    } catch {
      recorder.setStep('intro');
      recorder.setError('O navegador bloqueou o início do dueto. Toque novamente em iniciar.');
      return;
    }
    const canvasStream = canvas.captureStream(isSafariLike() ? 24 : 30);
    recorder.visualRecorderRef.current = startDuetRecorder(new MediaStream(canvasStream.getVideoTracks()), recorder.visualChunksRef.current, 'video');
    recorder.micRecorderRef.current = startDuetRecorder(new MediaStream(stream.getAudioTracks()), recorder.micChunksRef.current, 'audio');
    const monitor = buildDuetMonitorAudio(reference, stream);
    const tracks = Array.isArray(monitor) ? monitor : monitor.tracks;
    if (!Array.isArray(monitor)) {
      recorder.audioCtxRef.current = monitor.context;
      if (monitor.referenceTracks?.length) recorder.referenceRecorderRef.current = startDuetRecorder(new MediaStream(monitor.referenceTracks), recorder.referenceChunksRef.current, 'audio');
    }
    const mixedRecorder = startDuetRecorder(new MediaStream([...canvasStream.getVideoTracks(), ...tracks]), recorder.chunksRef.current, 'mixed');
    recorder.mediaRecorderRef.current = mixedRecorder;
    mixedRecorder.onstop = () => finishRecording(stream, mixedRecorder);
    reference.onended = () => { if (recorder.mediaRecorderRef.current?.state === 'recording') recorder.mediaRecorderRef.current.stop(); };
    recorder.setStep('recording');
  }

  function finishRecording(stream: MediaStream, mediaRecorder: MediaRecorder) {
    recorder.clearDraw();
    recorder.referenceRef.current?.pause();
    recorder.audioCtxRef.current?.close().catch(() => undefined);
    try { if (recorder.visualRecorderRef.current?.state === 'recording') recorder.visualRecorderRef.current.stop(); } catch {}
    try { if (recorder.micRecorderRef.current?.state === 'recording') recorder.micRecorderRef.current.stop(); } catch {}
    try { if (recorder.referenceRecorderRef.current?.state === 'recording') recorder.referenceRecorderRef.current.stop(); } catch {}
    const blob = new Blob(recorder.chunksRef.current, { type: mediaRecorder.mimeType || 'video/webm' });
    recorder.finalBlobRef.current = blob;
    recorder.setPreviewUrl(URL.createObjectURL(blob));
    stream.getTracks().forEach((track) => track.stop());
    window.setTimeout(() => {
      if (!recorder.visualChunksRef.current.length || !recorder.micChunksRef.current.length) return;
      const visualBlob = new Blob(recorder.visualChunksRef.current, { type: recorder.visualRecorderRef.current?.mimeType || 'video/webm' });
      const voiceBlob = new Blob(recorder.micChunksRef.current, { type: recorder.micRecorderRef.current?.mimeType || 'audio/webm' });
      const referenceBlob = recorder.referenceChunksRef.current.length ? new Blob(recorder.referenceChunksRef.current, { type: recorder.referenceRecorderRef.current?.mimeType || 'audio/webm' }) : null;
      recorder.visualBlobRef.current = visualBlob;
      recorder.voiceBlobRef.current = voiceBlob;
      recorder.referenceBlobRef.current = referenceBlob;
      recorder.setVisualUrl(URL.createObjectURL(visualBlob));
      recorder.prepareEngine(voiceBlob, referenceBlob).then(() => applyAutoMix(true)).catch(() => undefined);
    }, 900);
    recorder.setStep('review');
  }

  function stopRecording() { recorder.mediaRecorderRef.current?.stop(); }
  function reset() { recorder.cleanup(); resetLocalState(); recorder.setStep('intro'); }
  async function togglePlayback() { await recorder.togglePlayback(); }

  async function applyAutoMix(isInitial = false) {
    const voiceBlob = recorder.voiceBlobRef.current;
    const referenceBlob = recorder.referenceBlobRef.current;
    if (!voiceBlob || (!referenceBlob && !referenceSource)) return;
    setIsAutoMixing(true);
    setAutoMixMessage(isInitial ? 'Analisando sua voz e a referência...' : 'Analisando áudio...');
    try {
      const result = await calculateDuetAutoMix({ voiceBlob, referenceBlob, referenceSource, currentPreset: recorder.preset });
      recorder.setVoiceVolume(result.voiceVolume);
      recorder.setReferenceVolume(result.referenceVolume);
      recorder.setPreset(result.preset);
      premiumRenderCacheRef.current = null;
      setAutoMixMessage(result.message);
      if (!isInitial) setShowMixer(true);
    } catch {
      setAutoMixMessage(isInitial ? '' : 'Não consegui analisar automaticamente. Ajuste manualmente.');
    } finally { setIsAutoMixing(false); }
  }

  async function renderMixBlob() {
    const visualBlob = recorder.visualBlobRef.current;
    const voiceBlob = recorder.voiceBlobRef.current;
    const referenceBlob = recorder.referenceBlobRef.current;
    if (!visualBlob || !voiceBlob || (!referenceBlob && !referenceSource)) return null;
    const signature = mixSignature();
    const cached = premiumRenderCacheRef.current?.signature === signature ? premiumRenderCacheRef.current.blob : null;
    if (cached) return cached;
    const rendered = await Promise.race([
      renderFinalDuetVideo({ visualBlob, voiceBlob, referenceBlob, referenceSource, settings: recorder.settings() }),
      new Promise<Blob>((_, reject) => window.setTimeout(() => reject(new Error('render_timeout')), PUBLISH_RENDER_TIMEOUT_MS)),
    ]);
    if (rendered && rendered.size >= 1000) premiumRenderCacheRef.current = { signature, blob: rendered };
    return rendered;
  }

  async function uploadBlobForSubmit(postToCommunity: boolean) {
    const fallback = recorder.finalBlobRef.current;
    if (!postToCommunity) return fallback;
    if (!fallback) return null;
    setPublishProgress(10);
    setRenderStatus('Preparando publicação...');
    try {
      const rendered = needsPremiumRender() ? await renderMixBlob() : null;
      if (rendered?.size && rendered.size >= 1000) { setPublishProgress(60); return rendered; }
    } catch {}
    setPublishProgress(60);
    return fallback;
  }

  function startProgressTicker() {
    const timer = window.setInterval(() => setPublishProgress((value) => value >= 92 ? value : value + 2), 550);
    return () => window.clearInterval(timer);
  }

  async function submitDuet(finalCaption: string, options: SubmitOptions) {
    const safeOptions = { postToCommunity: options.postToCommunity, sendForReview: canSendForReview && options.sendForReview };
    if (!safeOptions.postToCommunity && !safeOptions.sendForReview) return recorder.setError(canSendForReview ? 'Escolha se deseja postar na comunidade, enviar para avaliação ou fazer os dois.' : 'No modo gratuito você pode postar seu dueto na comunidade.');
    recorder.setIsSubmitting(true);
    recorder.setError('');
    setPublishProgress(5);
    setRenderStatus(safeOptions.postToCommunity ? 'Preparando publicação...' : 'Enviando atividade...');
    const stopTicker = startProgressTicker();
    const blob = await uploadBlobForSubmit(safeOptions.postToCommunity);
    if (!blob) {
      stopTicker(); recorder.setIsSubmitting(false); setRenderStatus(''); setPublishProgress(0); recorder.setError('Grave o dueto antes de enviar.'); return;
    }
    try {
      const data = new FormData();
      const fileType = blob.type || 'video/webm';
      data.set('lesson_slug', lessonSlug);
      data.set('caption', finalCaption);
      data.set('visibility', safeOptions.postToCommunity ? 'community' : 'private');
      data.set('review_requested', String(safeOptions.sendForReview));
      data.set('voice_volume', String(recorder.voiceVolume));
      data.set('reference_volume', String(recorder.referenceVolume));
      data.set('voice_preset', recorder.preset);
      data.set('noise_reduction', String(recorder.noiseReduction));
      data.set('file', new File([blob], `${lessonSlug}-dueto.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.detail || json?.message || 'Não consegui enviar sua atividade.');
      }
      const json = await response.json().catch(() => null);
      const communityPostId = String(json?.community_post_id || '');
      stopTicker();
      setPublishProgress(100);
      recorder.setIsSubmitting(false);
      setRenderStatus('');
      setPostedCommunityHref(safeOptions.postToCommunity ? `/aluno/comunidade${communityPostId ? `#post-${communityPostId}` : ''}` : '');
      setPostedSummary(safeOptions.postToCommunity && safeOptions.sendForReview ? 'Publicado na comunidade e enviado para avaliação.' : safeOptions.postToCommunity ? 'Publicado na comunidade.' : 'Enviado para avaliação.');
      recorder.setStep('posted');
    } catch (error: any) {
      stopTicker(); recorder.setIsSubmitting(false); setRenderStatus(''); setPublishProgress(0); recorder.setError(error?.message || 'Não consegui enviar sua atividade.');
    }
  }

  function continuePublish() {
    const options = { postToCommunity: postCommunity, sendForReview: canSendForReview && sendForReview };
    if (!options.postToCommunity && !options.sendForReview) return recorder.setError(canSendForReview ? 'Marque pelo menos uma opção para continuar.' : 'No modo gratuito, marque Postar na comunidade para continuar.');
    if (options.postToCommunity) return recorder.setStep('caption');
    return submitDuet('', options);
  }

  return <main className="duet-stable-page">
    <section className="duet-stable-hero">
      <div>
        <p>Atividade prática</p>
        <h1>Grave seu dueto</h1>
        <span>Aula: {lessonTitle}</span>
      </div>
      <div className="duet-stable-tip"><Headphones size={22} /><strong>Use fone de ouvido</strong><small>Ouça a referência no fone e grave sua voz pelo microfone.</small></div>
    </section>

    {!canSendForReview ? <div className="duet-stable-alert">Modo gratuito: poste seu dueto na comunidade. Avaliação é recurso VIP.</div> : null}
    {recorder.error ? <div className="duet-stable-error"><AlertTriangle size={18} /> {recorder.error}</div> : null}

    {(recorder.step === 'intro' || recorder.step === 'loading') ? <section className="duet-stable-config">
      <button type="button" onClick={unlockAudioSetup} disabled={isLoadingDevices || recorder.step !== 'intro'}><Mic size={16} /> {audioSetupUnlocked ? 'Atualizar microfone' : 'Detectar microfone'}</button>
      <select value={selectedAudioDeviceId} onChange={(event) => chooseDevice(event.target.value)} disabled={isLoadingDevices || recorder.step !== 'intro'}>
        {audioDevices.length ? audioDevices.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label}{device.isLikelyHeadset ? ' · fone' : device.isLikelyPhoneMic ? ' · celular' : ''}</option>) : <option value="">Microfone padrão do navegador</option>}
      </select>
      <small>{deviceHint(selectedAudioDevice)}</small>
      {showBluetoothWarning ? <small className="duet-stable-warning">Bluetooth pode gerar atraso. Prefira fone com fio ou microfone do celular.</small> : null}
    </section> : null}

    <section className="duet-stable-stage">
      <video ref={recorder.referenceRef} className="duet-hidden-media" src={referenceSource} crossOrigin="anonymous" playsInline muted preload="auto" />
      <video ref={recorder.cameraRef} className="duet-hidden-media" autoPlay muted playsInline />
      {recorder.previewUrl ? <>
        <video ref={recorder.previewRef} className="duet-final-video" src={recorder.visualUrl || recorder.previewUrl} playsInline muted={Boolean(recorder.visualUrl)} controls={!recorder.visualUrl} onLoadedMetadata={() => recorder.engineRef.current?.setVideo(recorder.previewRef.current)} onEnded={() => { recorder.engineRef.current?.pause(false, true); recorder.setIsPlaying(false); }} />
        {recorder.visualUrl ? <button type="button" className="duet-stable-play" onClick={togglePlayback}>{recorder.isPlaying ? <Pause size={38} fill="currentColor" /> : <Play size={42} fill="currentColor" />}</button> : null}
      </> : <canvas ref={recorder.canvasRef} className="duet-canvas" width={1280} height={720} />}
      {recorder.step === 'intro' ? <div className="duet-stable-empty"><Video size={44} /><strong>O vídeo do dueto aparece aqui</strong><small>Toque em gravar para iniciar a câmera e a referência.</small></div> : null}
      {recorder.step === 'loading' ? <div className="duet-stable-overlay">Preparando vídeo, câmera e microfone...</div> : null}
      {recorder.step === 'countdown' ? <div className="duet-stable-count">{recorder.count}</div> : null}
      {recorder.step === 'recording' ? <div className="duet-stable-overlay recording">● Gravando...</div> : null}
      {recorder.step === 'review' ? <div className="duet-stable-chip"><Music2 size={16} /> {lessonTitle}</div> : null}
    </section>

    <section className="duet-stable-actions">
      {(recorder.step === 'intro' || recorder.step === 'loading') ? <button className="primary" onClick={startCountdown} disabled={recorder.step === 'loading'}><Mic size={18} /> {recorder.step === 'loading' ? 'Preparando...' : 'Gravar agora'}</button> : null}
      {recorder.step === 'recording' ? <button className="danger" onClick={stopRecording}>Finalizar gravação</button> : null}
      {recorder.step === 'review' ? <><button onClick={reset} disabled={recorder.isSubmitting}><RefreshCcw size={16} /> Regravar</button><button onClick={() => setShowMixer((value) => !value)} disabled={recorder.isSubmitting}><SlidersHorizontal size={16} /> {showMixer ? 'Ocultar mixagem' : 'Editar mixagem'}</button></> : null}
    </section>

    {renderStatus ? <div className="duet-stable-progress"><span>{renderStatus}</span><i><b style={{ width: `${Math.max(4, publishProgress)}%` }} /></i><small>{Math.min(100, Math.max(0, publishProgress))}%</small></div> : null}

    {recorder.step === 'review' && showMixer ? <DuetMixerPanel voiceVolume={recorder.voiceVolume} referenceVolume={recorder.referenceVolume} preset={recorder.preset as VoicePreset} canLiveEdit={recorder.canLiveEdit} latencyMs={recorder.latencyMs} noiseReduction={recorder.noiseReduction} isAutoMixing={isAutoMixing} autoMixMessage={autoMixMessage} onAutoMix={() => applyAutoMix(false)} onVoiceChange={recorder.setVoiceVolume} onReferenceChange={recorder.setReferenceVolume} onPresetChange={recorder.setPreset} onLatencyChange={recorder.setLatencyMs} onNoiseReductionChange={recorder.setNoiseReduction} onReset={() => { recorder.setVoiceVolume(DEFAULT_VOICE_VOLUME); recorder.setReferenceVolume(DEFAULT_REFERENCE_VOLUME); recorder.setPreset(DEFAULT_PRESET); recorder.setNoiseReduction(false); recorder.setLatencyMs(estimateDuetLatencyMs(selectedAudioDevice?.label)); setAutoMixMessage(''); }} /> : null}

    {recorder.step === 'review' ? <section className="duet-stable-card">
      <h2>Como deseja enviar?</h2>
      <label><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} disabled={recorder.isSubmitting} /> <Users size={18} /> Postar na comunidade</label>
      <label><input type="checkbox" checked={sendForReview && canSendForReview} onChange={(event) => setSendForReview(event.target.checked)} disabled={recorder.isSubmitting || !canSendForReview} /> <CheckCircle2 size={18} /> Enviar para avaliação</label>
      <button className="primary" onClick={continuePublish} disabled={recorder.isSubmitting || !hasPublishChoice}><UploadCloud size={18} /> {recorder.isSubmitting ? 'Enviando...' : 'Continuar'}</button>
    </section> : null}

    {recorder.step === 'caption' ? <section className="duet-stable-card">
      <h2>Legenda da comunidade</h2>
      <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda para o feed..." />
      <div className="duet-stable-actions"><button onClick={() => recorder.setStep('review')} disabled={recorder.isSubmitting}>Voltar</button><button className="primary" onClick={() => submitDuet(caption || 'Minha prática do dueto.', { postToCommunity: true, sendForReview })} disabled={recorder.isSubmitting}>{recorder.isSubmitting ? 'Publicando...' : 'Publicar vídeo'}</button></div>
    </section> : null}

    {recorder.step === 'posted' ? <section className="duet-stable-card posted"><CheckCircle2 size={32} /><h2>Vídeo enviado</h2><p>{postedSummary}</p><div className="duet-stable-actions">{postedCommunityHref ? <a href={postedCommunityHref}>Ver postagem</a> : null}<a href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
  </main>;
}
