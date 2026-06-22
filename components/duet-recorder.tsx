'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Headphones, Mic, Music2, Pause, Play, RefreshCcw, Send, SlidersHorizontal, Sparkles, UploadCloud, Video, Wand2 } from 'lucide-react';
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

type Props = {
  lessonTitle: string;
  lessonSlug: string;
  referenceUrl?: string | null;
  referenceEmbedUrl?: string | null;
};

const FINAL_RENDER_TIMEOUT_MS = 12000;
const BACKGROUND_RENDER_TIMEOUT_MS = 20000;
const DEFAULT_VOICE_VOLUME = 135;
const DEFAULT_REFERENCE_VOLUME = 45;
const DEFAULT_PRESET: VoicePreset = 'natural';

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl }: Props) {
  const referenceSource = proxiedVideoUrl(referenceUrl);
  const recorder = useDuetBufferRecorder(referenceSource, lessonSlug);
  const [caption, setCaption] = useState('');
  const [postCommunity, setPostCommunity] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [micMode] = useState<DuetMicMode>('studio');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [audioSetupUnlocked, setAudioSetupUnlocked] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [renderStatus, setRenderStatus] = useState('');
  const [isAutoMixing, setIsAutoMixing] = useState(false);
  const [autoMixMessage, setAutoMixMessage] = useState('');
  const premiumRenderCacheRef = useRef<{ signature: string; blob: Blob } | null>(null);

  const selectedAudioDevice = audioDevices.find((device) => device.deviceId === selectedAudioDeviceId) || null;
  const showBluetoothWarning = Boolean(selectedAudioDevice?.isLikelyHeadset);

  useEffect(() => {
    recorder.applySettings();
  }, [recorder.voiceVolume, recorder.referenceVolume, recorder.preset, recorder.latencyMs, recorder.noiseReduction]);

  useEffect(() => {
    refreshAudioDevices(false).catch(() => undefined);
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const onDeviceChange = () => refreshAudioDevices(false).catch(() => undefined);
    mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, []);

  function mixSignature() {
    return [recorder.voiceVolume, recorder.referenceVolume, recorder.preset, recorder.noiseReduction ? 'nr' : 'raw'].join(':');
  }

  function needsPremiumRender() {
    return recorder.voiceVolume !== DEFAULT_VOICE_VOLUME
      || recorder.referenceVolume !== DEFAULT_REFERENCE_VOLUME
      || recorder.preset !== DEFAULT_PRESET
      || recorder.noiseReduction;
  }

  function chooseDevice(deviceId: string, devices = audioDevices) {
    setSelectedAudioDeviceId(deviceId);
    const device = devices.find((item) => item.deviceId === deviceId);
    recorder.setLatencyMs(estimateDuetLatencyMs(device?.label));
  }

  async function refreshAudioDevices(preferPhoneMic = false) {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setIsLoadingDevices(true);
    try {
      const devices = await listAudioInputDevices();
      setAudioDevices(devices);
      if (!selectedAudioDeviceId || !devices.some((device) => device.deviceId === selectedAudioDeviceId)) {
        chooseDevice(preferPhoneMic ? preferredPhoneMicDeviceId(devices) : devices[0]?.deviceId || '', devices);
      }
    } finally {
      setIsLoadingDevices(false);
    }
  }

  async function unlockAudioSetup() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    setIsLoadingDevices(true);
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((track) => track.stop());
      setAudioSetupUnlocked(true);
      await refreshAudioDevices(true);
    } catch {
      recorder.setError('Não consegui acessar os microfones. Permita o microfone no navegador para escolher a entrada de áudio.');
    } finally {
      setIsLoadingDevices(false);
    }
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
    setPostCommunity(false);
    setShowMixer(false);
    setRenderStatus('');
    setIsAutoMixing(false);
    setAutoMixMessage('');
  }

  async function startCountdown() {
    resetLocalState();
    recorder.cleanup();

    if (!recorder.canRecord) {
      recorder.setError('Seu navegador não liberou câmera/microfone. Tente pelo Chrome ou Safari atualizado.');
      return;
    }
    if (!referenceSource) {
      recorder.setError('Essa atividade ainda não tem vídeo de referência vinculado.');
      return;
    }

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
        if (next <= 0) {
          window.clearInterval(timer);
          beginRecording(stream);
        } else {
          recorder.setCount(next);
        }
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
      if (monitor.referenceTracks?.length) {
        recorder.referenceRecorderRef.current = startDuetRecorder(new MediaStream(monitor.referenceTracks), recorder.referenceChunksRef.current, 'audio');
      }
    }
    const mixedStream = new MediaStream([...canvasStream.getVideoTracks(), ...tracks]);
    const mixedRecorder = startDuetRecorder(mixedStream, recorder.chunksRef.current, 'mixed');
    recorder.mediaRecorderRef.current = mixedRecorder;
    mixedRecorder.onstop = () => finishRecording(stream, mixedRecorder);
    reference.onended = () => {
      if (recorder.mediaRecorderRef.current?.state === 'recording') recorder.mediaRecorderRef.current.stop();
    };
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
      if (recorder.visualChunksRef.current.length && recorder.micChunksRef.current.length) {
        const visualBlob = new Blob(recorder.visualChunksRef.current, { type: recorder.visualRecorderRef.current?.mimeType || 'video/webm' });
        const voiceBlob = new Blob(recorder.micChunksRef.current, { type: recorder.micRecorderRef.current?.mimeType || 'audio/webm' });
        const referenceBlob = recorder.referenceChunksRef.current.length
          ? new Blob(recorder.referenceChunksRef.current, { type: recorder.referenceRecorderRef.current?.mimeType || 'audio/webm' })
          : null;
        recorder.visualBlobRef.current = visualBlob;
        recorder.voiceBlobRef.current = voiceBlob;
        recorder.referenceBlobRef.current = referenceBlob;
        recorder.setVisualUrl(URL.createObjectURL(visualBlob));
        recorder.prepareEngine(voiceBlob, referenceBlob)
          .then(() => applyAutoMix(true))
          .catch(() => {
            recorder.setError('O motor ao vivo não conseguiu preparar os áudios gravados. A prévia original ainda pode ser enviada.');
          });
      }
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
      const result = await calculateDuetAutoMix({
        voiceBlob,
        referenceBlob,
        referenceSource,
        currentPreset: recorder.preset,
      });
      recorder.setVoiceVolume(result.voiceVolume);
      recorder.setReferenceVolume(result.referenceVolume);
      recorder.setPreset(result.preset);
      premiumRenderCacheRef.current = null;
      setAutoMixMessage(result.message);
      if (!isInitial) setShowMixer(true);
    } catch {
      setAutoMixMessage(isInitial ? '' : 'Não consegui analisar automaticamente. Ajuste manualmente.');
    } finally {
      setIsAutoMixing(false);
    }
  }

  function fallbackUploadBlob() {
    return recorder.finalBlobRef.current;
  }

  async function renderPremiumInBackground(submissionId: string) {
    const visualBlob = recorder.visualBlobRef.current;
    const voiceBlob = recorder.voiceBlobRef.current;
    const referenceBlob = recorder.referenceBlobRef.current;
    if (!submissionId || !visualBlob || !voiceBlob || (!referenceBlob && !referenceSource)) return;
    if (!needsPremiumRender()) {
      setRenderStatus('');
      return;
    }

    const signature = mixSignature();
    setRenderStatus('Publicado. Refinando apenas os ajustes de mix...');
    try {
      let rendered = premiumRenderCacheRef.current?.signature === signature ? premiumRenderCacheRef.current.blob : null;
      if (!rendered) {
        const renderPromise = renderFinalDuetVideo({ visualBlob, voiceBlob, referenceBlob, referenceSource, settings: recorder.settings() });
        const timeoutPromise = new Promise<Blob>((_, reject) => {
          window.setTimeout(() => reject(new Error('render_timeout')), BACKGROUND_RENDER_TIMEOUT_MS);
        });
        rendered = await Promise.race([renderPromise, timeoutPromise]);
        if (rendered && rendered.size >= 1000) premiumRenderCacheRef.current = { signature, blob: rendered };
      }
      if (!rendered || rendered.size < 1000) return;

      const fileType = rendered.type || 'video/webm';
      const data = new FormData();
      data.set('submission_id', submissionId);
      data.set('file', new File([rendered], `${lessonSlug}-dueto-premium.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      await fetch('/api/submissions/duet/premium', { method: 'POST', body: data });
    } catch {
      // A versão segura já foi publicada. A mix premium é melhoria opcional.
    } finally {
      setRenderStatus('');
    }
  }

  async function submitDuet(finalCaption: string, forceCommunity = false) {
    recorder.setIsSubmitting(true);
    recorder.setError('');
    setRenderStatus('Publicando agora...');
    const blob = fallbackUploadBlob();
    if (!blob) {
      recorder.setIsSubmitting(false);
      setRenderStatus('');
      if (!recorder.error) recorder.setError('Grave o dueto antes de enviar.');
      return;
    }
    try {
      const data = new FormData();
      const fileType = blob.type || 'video/webm';
      data.set('lesson_slug', lessonSlug);
      data.set('caption', finalCaption);
      data.set('visibility', forceCommunity ? 'community' : 'private');
      data.set('voice_volume', String(recorder.voiceVolume));
      data.set('reference_volume', String(recorder.referenceVolume));
      data.set('voice_preset', recorder.preset);
      data.set('noise_reduction', String(recorder.noiseReduction));
      data.set('file', new File([blob], `${lessonSlug}-dueto.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        recorder.setError(json?.detail || json?.message || 'Não consegui enviar sua atividade.');
        recorder.setIsSubmitting(false);
        setRenderStatus('');
        return;
      }
      const json = await response.json().catch(() => null);
      const submissionId = String(json?.id || '');
      recorder.setIsSubmitting(false);
      setRenderStatus(submissionId && needsPremiumRender() ? 'Publicado. Refinando apenas os ajustes de mix...' : '');
      recorder.setStep('posted');
      if (submissionId) void renderPremiumInBackground(submissionId);
    } catch {
      recorder.setIsSubmitting(false);
      setRenderStatus('');
      recorder.setError('Não consegui enviar sua atividade.');
    }
  }

  return (
    <div className="duet-remix-studio real-duet-studio premium-duet-studio reels-duet-editor smule-duet-studio">
      <section className="duet-remix-header premium-duet-header reels-duet-topbar">
        <div>
          <p className="eyebrow">Atividade prática</p>
          <h1>Grave seu dueto</h1>
          <p className="muted">Aula: {lessonTitle}</p>
          <div className="premium-duet-steps"><span><Video size={16} /> Grave</span><span><Wand2 size={16} /> Motor de áudio</span><span><Send size={16} /> Envie</span></div>
        </div>
        <div className="duet-instruction compact premium-duet-instruction"><Headphones size={24} /><div><strong>Use fone de ouvido</strong><p>Ouça pelo fone e escolha se a voz será captada pelo microfone do celular ou do fone.</p></div></div>
      </section>

      {recorder.error ? <p className="duet-error premium-duet-error">{recorder.error}</p> : null}

      {recorder.step === 'intro' || recorder.step === 'loading' ? (
        <section className="premium-duet-note duet-audio-setup-card">
          <Headphones size={24} />
          <div>
            <h2>Configuração de áudio</h2>
            <p>Para melhor qualidade: deixe a referência no fone e escolha abaixo o microfone que vai gravar sua voz.</p>
            <div className="duet-device-row">
              <select value={selectedAudioDeviceId} onChange={(event) => chooseDevice(event.target.value)} disabled={isLoadingDevices || recorder.step !== 'intro'}>
                {audioDevices.length ? audioDevices.map((device) => (
                  <option value={device.deviceId} key={device.deviceId}>{device.label}{device.isLikelyHeadset ? ' · fone' : device.isLikelyPhoneMic ? ' · celular' : ''}</option>
                )) : <option value="">Microfone padrão do navegador</option>}
              </select>
              <button type="button" className="button secondary" onClick={unlockAudioSetup} disabled={isLoadingDevices || recorder.step !== 'intro'}><Mic size={16} /> {audioSetupUnlocked ? 'Atualizar' : 'Detectar microfones'}</button>
            </div>
            <p className="muted">{deviceHint(selectedAudioDevice)} {audioSetupUnlocked ? '' : 'Toque em detectar para liberar nomes como Bluetooth, fone ou microfone interno.'}</p>
            {showBluetoothWarning ? <p className="duet-warning"><AlertTriangle size={16} /> Bluetooth pode gerar atraso. Para duetos mais precisos, use fone com fio ou grave pelo microfone do celular.</p> : null}
            <p className="muted">Captação natural ativa. Redução de ruído fica disponível depois da gravação, sem prejudicar a captura original.</p>
          </div>
        </section>
      ) : null}

      <section className="real-duet-stage premium-duet-stage reels-duet-preview">
        <video ref={recorder.referenceRef} className="ios-duet-source" src={referenceSource} crossOrigin="anonymous" playsInline muted preload="auto" />
        <video ref={recorder.cameraRef} className="ios-duet-source" autoPlay muted playsInline />
        {recorder.previewUrl ? (
          <>
            <video ref={recorder.previewRef} className="duet-final-video realtime-duet-video" src={recorder.visualUrl || recorder.previewUrl} playsInline muted={Boolean(recorder.visualUrl)} controls={!recorder.visualUrl} onLoadedMetadata={() => recorder.engineRef.current?.setVideo(recorder.previewRef.current)} onEnded={() => { recorder.engineRef.current?.pause(false, true); recorder.setIsPlaying(false); }} />
            {recorder.visualUrl ? <button type="button" className="reels-preview-play" onClick={togglePlayback}>{recorder.isPlaying ? <Pause size={34} fill="currentColor" /> : <Play size={38} fill="currentColor" />}</button> : null}
          </>
        ) : <canvas ref={recorder.canvasRef} className="duet-canvas" width={1280} height={720} />}
        {recorder.step === 'intro' ? <div className="duet-stage-overlay premium-duet-overlay"><div className="premium-duet-start-card"><span><Sparkles size={20} /> Pronto para praticar?</span><h2>Grave sua segunda voz junto com a referência.</h2><p>Prepare o fone, confira o microfone escolhido e clique para iniciar a contagem.</p><button className="button premium-primary-button" onClick={startCountdown}><Mic size={18} /> Iniciar dueto</button></div></div> : null}
        {recorder.step === 'loading' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">Preparando vídeo, câmera e microfone...</span></div> : null}
        {recorder.step === 'countdown' ? <div className="countdown overlay-countdown">{recorder.count}</div> : null}
        {recorder.step === 'recording' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">● Gravando...</span></div> : null}
        {recorder.step === 'rendering' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">{renderStatus || 'Renderizando mix final...'}</span></div> : null}
        {recorder.step === 'review' ? <div className="reels-video-chip"><Music2 size={17} /> {lessonTitle}</div> : null}
      </section>

      {renderStatus && recorder.step !== 'rendering' && recorder.step !== 'posted' ? <p className="duet-render-status">{renderStatus}</p> : null}
      {recorder.step === 'review' ? <div className="duet-mixer-toggle-wrap"><button type="button" className="button secondary" onClick={() => setShowMixer((value) => !value)}><SlidersHorizontal size={16} /> {showMixer ? 'Ocultar mixer' : 'Editar mixagem'}</button></div> : null}
      {recorder.step === 'review' && showMixer ? <DuetMixerPanel voiceVolume={recorder.voiceVolume} referenceVolume={recorder.referenceVolume} preset={recorder.preset as VoicePreset} canLiveEdit={recorder.canLiveEdit} latencyMs={recorder.latencyMs} noiseReduction={recorder.noiseReduction} isAutoMixing={isAutoMixing} autoMixMessage={autoMixMessage} onAutoMix={() => applyAutoMix(false)} onVoiceChange={recorder.setVoiceVolume} onReferenceChange={recorder.setReferenceVolume} onPresetChange={recorder.setPreset} onLatencyChange={recorder.setLatencyMs} onNoiseReductionChange={recorder.setNoiseReduction} onReset={() => { recorder.setVoiceVolume(DEFAULT_VOICE_VOLUME); recorder.setReferenceVolume(DEFAULT_REFERENCE_VOLUME); recorder.setPreset(DEFAULT_PRESET); recorder.setNoiseReduction(false); recorder.setLatencyMs(estimateDuetLatencyMs(selectedAudioDevice?.label)); setAutoMixMessage(''); }} /> : null}

      <section className="duet-control-bar premium-duet-control-bar reels-review-actions">
        {recorder.step === 'recording' ? <><span className="recording-dot">● Gravando dueto</span><button className="button danger" onClick={stopRecording}>Finalizar gravação</button></> : null}
        {recorder.step === 'review' ? <><button className="button secondary" onClick={reset} disabled={recorder.isSubmitting}><RefreshCcw size={16} /> Regravar</button><label className="community-toggle review-community-toggle"><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} disabled={recorder.isSubmitting} /> Publicar também na comunidade</label><button className="button" onClick={() => postCommunity ? recorder.setStep('caption') : submitDuet('', false)} disabled={recorder.isSubmitting}><UploadCloud size={16} /> {postCommunity ? 'Continuar' : recorder.isSubmitting ? (renderStatus || 'Publicando...') : 'Enviar para avaliação'}</button></> : null}
      </section>

      {recorder.step === 'review' ? <section className="duet-review-note premium-duet-note"><CheckCircle2 size={24} /><div><h2>Dueto pronto</h2><p>O Hub já tenta equilibrar voz e referência automaticamente. Abra o mixer apenas se quiser refinar.</p></div></section> : null}
      {recorder.step === 'caption' ? <section className="caption-box duet-caption-box premium-duet-note reels-publish-card"><div><h2>Legenda da comunidade</h2><p>Compartilhe sua prática no feed.</p><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda para o feed..." /></div><button className="button" onClick={() => submitDuet(caption || 'Minha prática do dueto.', true)} disabled={recorder.isSubmitting}>{recorder.isSubmitting ? (renderStatus || 'Publicando...') : 'Publicar no feed e enviar'}</button></section> : null}
      {recorder.step === 'posted' ? <section className="posted-box duet-posted-box premium-duet-note"><CheckCircle2 size={28} /><div><h2>Atividade enviada</h2><p>Sua gravação já foi publicada. Se você ajustar a mix, o Hub refina só essa camada em segundo plano.</p><a className="button secondary" href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
    </div>
  );
}
