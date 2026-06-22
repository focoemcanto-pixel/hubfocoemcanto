'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Headphones, Mic, Music2, Pause, Play, RefreshCcw, Send, Sparkles, UploadCloud, Video, Wand2 } from 'lucide-react';
import { DuetMixerPanel } from '@/components/duet/duet-mixer-panel';
import { prepareDuetCamera } from '@/lib/audio/duet-camera';
import { isSafariLike, startDuetRecorder } from '@/lib/audio/duet-media';
import { buildDuetMonitorAudio } from '@/lib/audio/duet-monitor';
import { proxiedVideoUrl } from '@/lib/audio/duet-recording-utils';
import { useDuetBufferRecorder } from '@/lib/audio/use-duet-buffer-recorder';
import { renderFinalDuetVideo } from '@/lib/audio/duet-final-render';
import type { VoicePreset } from '@/lib/audio/duet-buffer-engine';

type Props = {
  lessonTitle: string;
  lessonSlug: string;
  referenceUrl?: string | null;
  referenceEmbedUrl?: string | null;
};

export function DuetRecorder({ lessonTitle, lessonSlug, referenceUrl }: Props) {
  const referenceSource = proxiedVideoUrl(referenceUrl);
  const recorder = useDuetBufferRecorder(referenceSource, lessonSlug);
  const [caption, setCaption] = useState('');
  const [postCommunity, setPostCommunity] = useState(false);

  useEffect(() => {
    recorder.applySettings();
  }, [recorder.voiceVolume, recorder.referenceVolume, recorder.preset]);

  function resetLocalState() {
    recorder.setPreviewUrl(null);
    recorder.setVisualUrl(null);
    recorder.setAudioReady(false);
    recorder.setError('');
    recorder.chunksRef.current = [];
    recorder.visualChunksRef.current = [];
    recorder.micChunksRef.current = [];
    recorder.finalBlobRef.current = null;
    recorder.visualBlobRef.current = null;
    recorder.voiceBlobRef.current = null;
    setCaption('');
    setPostCommunity(false);
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
      const stream = await prepareDuetCamera(recorder.cameraRef.current);
      recorder.streamRef.current = stream;
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
    if (!Array.isArray(monitor)) recorder.audioCtxRef.current = monitor.context;
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

    const blob = new Blob(recorder.chunksRef.current, { type: mediaRecorder.mimeType || 'video/webm' });
    recorder.finalBlobRef.current = blob;
    recorder.setPreviewUrl(URL.createObjectURL(blob));
    stream.getTracks().forEach((track) => track.stop());

    window.setTimeout(() => {
      if (recorder.visualChunksRef.current.length && recorder.micChunksRef.current.length) {
        const visualBlob = new Blob(recorder.visualChunksRef.current, { type: recorder.visualRecorderRef.current?.mimeType || 'video/webm' });
        const voiceBlob = new Blob(recorder.micChunksRef.current, { type: recorder.micRecorderRef.current?.mimeType || 'audio/webm' });
        recorder.visualBlobRef.current = visualBlob;
        recorder.voiceBlobRef.current = voiceBlob;
        recorder.setVisualUrl(URL.createObjectURL(visualBlob));
        recorder.prepareEngine(voiceBlob).catch(() => {
          recorder.setError('O motor ao vivo não conseguiu decodificar essa referência. A prévia original ainda pode ser enviada.');
        });
      }
    }, 900);

    recorder.setStep('review');
  }

  function stopRecording() {
    recorder.mediaRecorderRef.current?.stop();
  }

  function reset() {
    recorder.cleanup();
    resetLocalState();
    recorder.setStep('intro');
  }

  async function togglePlayback() {
    await recorder.togglePlayback();
  }

  async function getUploadBlob() {
    const fallback = recorder.finalBlobRef.current;
    const visualBlob = recorder.visualBlobRef.current;
    const voiceBlob = recorder.voiceBlobRef.current;
    if (!visualBlob || !voiceBlob || !referenceSource) return fallback;
    recorder.setStep('rendering');
    try {
      const rendered = await renderFinalDuetVideo({
        visualBlob,
        voiceBlob,
        referenceSource,
        settings: {
          voiceVolume: recorder.voiceVolume,
          referenceVolume: recorder.referenceVolume,
          preset: recorder.preset,
        },
      });
      recorder.finalBlobRef.current = rendered;
      recorder.setPreviewUrl(URL.createObjectURL(rendered));
      return rendered;
    } catch {
      recorder.setError('Não consegui renderizar a mix final neste navegador. Vou enviar a prévia original.');
      return fallback;
    } finally {
      recorder.setStep('review');
    }
  }

  async function submitDuet(finalCaption: string, forceCommunity = false) {
    const blob = await getUploadBlob();
    if (!blob) {
      recorder.setError('Grave o dueto antes de enviar.');
      return;
    }
    recorder.setIsSubmitting(true);
    recorder.setError('');
    recorder.engineRef.current?.pause(true);
    try {
      const data = new FormData();
      const fileType = blob.type || 'video/webm';
      data.set('lesson_slug', lessonSlug);
      data.set('caption', finalCaption);
      data.set('visibility', forceCommunity ? 'community' : 'private');
      data.set('voice_volume', String(recorder.voiceVolume));
      data.set('reference_volume', String(recorder.referenceVolume));
      data.set('voice_preset', recorder.preset);
      data.set('file', new File([blob], `${lessonSlug}-dueto.${fileType.includes('mp4') ? 'mp4' : 'webm'}`, { type: fileType }));
      const response = await fetch('/api/submissions/duet', { method: 'POST', body: data });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        recorder.setError(json?.detail || json?.message || 'Não consegui enviar sua atividade.');
        recorder.setIsSubmitting(false);
        return;
      }
      recorder.setIsSubmitting(false);
      recorder.setStep('posted');
    } catch {
      recorder.setIsSubmitting(false);
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
        <div className="duet-instruction compact premium-duet-instruction"><Headphones size={24} /><div><strong>Use fone de ouvido</strong><p>O editor usa um único clock de áudio. Volumes e efeitos mudam enquanto você ouve, sem aplicar prévia.</p></div></div>
      </section>

      {recorder.error ? <p className="duet-error premium-duet-error">{recorder.error}</p> : null}

      <section className="real-duet-stage premium-duet-stage reels-duet-preview">
        <video ref={recorder.referenceRef} className="ios-duet-source" src={referenceSource} crossOrigin="anonymous" playsInline muted preload="auto" />
        <video ref={recorder.cameraRef} className="ios-duet-source" autoPlay muted playsInline />
        {recorder.previewUrl ? (
          <>
            <video ref={recorder.previewRef} className="duet-final-video realtime-duet-video" src={recorder.visualUrl || recorder.previewUrl} playsInline muted={Boolean(recorder.visualUrl)} controls={!recorder.visualUrl} onLoadedMetadata={() => recorder.engineRef.current?.setVideo(recorder.previewRef.current)} onEnded={() => { recorder.engineRef.current?.pause(false, true); recorder.setIsPlaying(false); }} />
            {recorder.visualUrl ? <button type="button" className="reels-preview-play" onClick={togglePlayback}>{recorder.isPlaying ? <Pause size={34} fill="currentColor" /> : <Play size={38} fill="currentColor" />}</button> : null}
          </>
        ) : <canvas ref={recorder.canvasRef} className="duet-canvas" width={1280} height={720} />}
        {recorder.step === 'intro' ? <div className="duet-stage-overlay premium-duet-overlay"><div className="premium-duet-start-card"><span><Sparkles size={20} /> Pronto para praticar?</span><h2>Grave sua segunda voz junto com a referência.</h2><p>Prepare o fone, posicione a câmera e clique para iniciar a contagem.</p><button className="button premium-primary-button" onClick={startCountdown}><Mic size={18} /> Iniciar dueto</button></div></div> : null}
        {recorder.step === 'loading' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">Preparando vídeo e câmera...</span></div> : null}
        {recorder.step === 'countdown' ? <div className="countdown overlay-countdown">{recorder.count}</div> : null}
        {recorder.step === 'recording' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">● Gravando...</span></div> : null}
        {recorder.step === 'rendering' ? <div className="duet-stage-overlay premium-duet-overlay"><span className="recording-dot">Renderizando mix final...</span></div> : null}
        {recorder.step === 'review' ? <div className="reels-video-chip"><Music2 size={17} /> {lessonTitle}</div> : null}
      </section>

      {recorder.step === 'review' ? <DuetMixerPanel voiceVolume={recorder.voiceVolume} referenceVolume={recorder.referenceVolume} preset={recorder.preset as VoicePreset} canLiveEdit={recorder.canLiveEdit} onVoiceChange={recorder.setVoiceVolume} onReferenceChange={recorder.setReferenceVolume} onPresetChange={recorder.setPreset} onReset={() => { recorder.setVoiceVolume(135); recorder.setReferenceVolume(45); recorder.setPreset('worship'); }} /> : null}

      <section className="duet-control-bar premium-duet-control-bar reels-review-actions">
        {recorder.step === 'recording' ? <><span className="recording-dot">● Gravando dueto</span><button className="button danger" onClick={stopRecording}>Finalizar gravação</button></> : null}
        {recorder.step === 'review' ? <><button className="button secondary" onClick={reset}><RefreshCcw size={16} /> Regravar</button><label className="community-toggle review-community-toggle"><input type="checkbox" checked={postCommunity} onChange={(event) => setPostCommunity(event.target.checked)} /> Publicar também na comunidade</label><button className="button" onClick={() => postCommunity ? recorder.setStep('caption') : submitDuet('', false)} disabled={recorder.isSubmitting}><UploadCloud size={16} /> {postCommunity ? 'Continuar' : recorder.isSubmitting ? 'Enviando...' : 'Enviar para avaliação'}</button></> : null}
      </section>

      {recorder.step === 'review' ? <section className="duet-review-note premium-duet-note"><CheckCircle2 size={24} /><div><h2>Dueto pronto para mixar</h2><p>O ajuste é ouvido em tempo real. Ao enviar, o Hub renderiza a versão final com sua mixagem.</p></div></section> : null}
      {recorder.step === 'caption' ? <section className="caption-box duet-caption-box premium-duet-note reels-publish-card"><div><h2>Legenda da comunidade</h2><p>Compartilhe sua prática no feed.</p><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva uma legenda para o feed..." /></div><button className="button" onClick={() => submitDuet(caption || 'Minha prática do dueto.', true)} disabled={recorder.isSubmitting}>{recorder.isSubmitting ? 'Enviando...' : 'Publicar no feed e enviar'}</button></section> : null}
      {recorder.step === 'posted' ? <section className="posted-box duet-posted-box premium-duet-note"><CheckCircle2 size={28} /><div><h2>Atividade enviada</h2><p>Sua gravação entrou na fila de avaliação do professor.</p><a className="button secondary" href={`/aluno/aula/${lessonSlug}`}>Voltar para aula</a></div></section> : null}
    </div>
  );
}
