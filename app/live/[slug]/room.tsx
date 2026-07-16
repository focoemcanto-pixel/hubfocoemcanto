'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import {
  Camera, CameraOff, Circle, Copy, Grid2X2, Hand, Layers, LayoutPanelTop,
  LogOut, MessageCircle, Mic, Mic2, MicOff, MonitorUp, Music2, Play,
  Radio, Send, Share2, ShoppingBag, Sparkles, Square, Star, UserMinus,
  Users, Video, X,
} from 'lucide-react';
import './room-layout.css';
import './room-professional.css';
import './meet-stage.css';
import './professional-stability.css';

type Offer = { id: string; name: string; headline?: string | null; description?: string | null; price?: string | null; old_price?: string | null; checkout_url: string; direct_checkout_url?: string | null; cta_label?: string | null; image_url?: string | null; badge?: string | null };
type OfferMode = 'hidden' | 'split' | 'banner' | 'floating';
type LayoutMode = 'class' | 'grid' | 'auto';
type AudioMode = 'speech' | 'music';
type Live = { id: string; title: string; description?: string | null; status: string; access_type: string; guest_access_enabled: boolean; guest_fields?: { name?: boolean; email?: boolean; whatsapp?: boolean }; starts_at?: string | null; current_scene?: string; recording_enabled?: boolean; waiting_room_locked?: boolean; offer_config?: { offer?: Offer | null; mode?: OfferMode; displayed_at?: string }; offers?: Offer[] };
type ChatMessage = { id: string; name: string; body: string; mine?: boolean };
type EntryRequest = { id: string; guest_name: string; guest_email?: string | null; status: string; created_at: string };
type Props = { slug: string; initialLive: Live };

function absoluteUrl(value: string) {
  const base = typeof window === 'undefined' ? 'https://escola.focoemcanto.com' : window.location.origin;
  try { return new URL(value, base).toString(); } catch { return value; }
}

function mediaTrack(participant: any, kind: 'video' | 'audio' | 'screenVideo' | 'screenAudio') {
  return participant?.tracks?.[kind]?.persistentTrack || participant?.tracks?.[kind]?.track || participant?.[`${kind}Track`] || null;
}

function participantAvatar(participant: any) {
  return participant?.userData?.avatar_url || participant?.user_data?.avatar_url || null;
}

function VideoTile({ participant, compact = false, speaking = false }: { participant: any; compact?: boolean; speaking?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoTrack = mediaTrack(participant, 'video');
  const audioTrack = mediaTrack(participant, 'audio');
  const name = participant?.user_name || (participant?.local ? 'Você' : 'Participante');
  const avatar = participantAvatar(participant);
  const cameraOn = participant?.video !== false && Boolean(videoTrack);
  const micOn = participant?.audio !== false;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
    if (videoTrack) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [videoTrack?.id, participant?.video]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || participant?.local) return;
    audio.srcObject = audioTrack ? new MediaStream([audioTrack]) : null;
    if (audioTrack) void audio.play().catch(() => undefined);
    return () => { audio.srcObject = null; };
  }, [audioTrack?.id, participant?.audio, participant?.local]);

  return <article className={`fl-video-tile${compact ? ' compact' : ''}${speaking ? ' speaking' : ''}`}>
    <div className="fl-video-frame">
      {cameraOn ? <video ref={videoRef} autoPlay playsInline muted={Boolean(participant?.local)} /> : avatar ? <img className="fl-profile-avatar" src={avatar} alt={name} /> : <div className="fl-avatar">{name.slice(0, 1).toUpperCase()}</div>}
      {!participant?.local && <audio ref={audioRef} autoPlay />}
    </div>
    <div className="fl-video-meta"><span>{name}{participant?.local ? ' (você)' : ''}</span><i>{micOn ? <Mic size={13} /> : <MicOff size={13} />}</i></div>
  </article>;
}

function ScreenTile({ participant }: { participant: any }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoTrack = mediaTrack(participant, 'screenVideo');
  const audioTrack = mediaTrack(participant, 'screenAudio');
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
    if (videoTrack) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [videoTrack?.id]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || participant?.local) return;
    audio.srcObject = audioTrack ? new MediaStream([audioTrack]) : null;
    if (audioTrack) void audio.play().catch(() => undefined);
    return () => { audio.srcObject = null; };
  }, [audioTrack?.id, participant?.local]);
  return <div className="fl-screen-tile"><video ref={videoRef} autoPlay playsInline muted={Boolean(participant?.local)} />{!participant?.local && <audio ref={audioRef} autoPlay />}<span>{participant?.user_name || 'Apresentador'} está apresentando</span></div>;
}

function OfferContent({ offer, compact = false }: { offer: Offer; compact?: boolean }) {
  const trackedDestination = absoluteUrl(offer.checkout_url);
  const qrDestination = absoluteUrl(offer.direct_checkout_url || offer.checkout_url);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrDestination)}`;
  return <div className={`fl-live-offer-content${compact ? ' compact' : ''}`}><span>{offer.badge || 'Oferta especial'}</span><h2>{offer.headline || offer.name}</h2>{!compact && offer.description && <p>{offer.description}</p>}<div className="fl-live-offer-price">{offer.old_price && <del>{offer.old_price}</del>}{offer.price && <strong>{offer.price}</strong>}</div>{!compact && <img src={qrUrl} alt={`QR Code para ${offer.name}`} />}<a href={trackedDestination} target="_blank" rel="noreferrer">{offer.cta_label || 'Quero garantir minha vaga'}</a></div>;
}

function timeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), milliseconds))]);
}

export default function FocoLiveRoom({ slug, initialLive }: Props) {
  const callRef = useRef<any>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const [isHost, setIsHost] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [liveStatus, setLiveStatus] = useState(initialLive.status);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [participants, setParticipants] = useState<Record<string, any>>({});
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [raised, setRaised] = useState(false);
  const [canSpeak, setCanSpeak] = useState(true);
  const [canUseCamera, setCanUseCamera] = useState(true);
  const [featuredSessionId, setFeaturedSessionId] = useState<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('class');
  const [sidePanel, setSidePanel] = useState<'chat' | 'people' | 'director' | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [unreadChat, setUnreadChat] = useState(0);
  const [activeOffer, setActiveOffer] = useState<Offer | null>(initialLive.offer_config?.offer || null);
  const [offerMode, setOfferMode] = useState<OfferMode>(initialLive.offer_config?.mode || 'hidden');
  const [online, setOnline] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audioMode, setAudioMode] = useState<AudioMode>('speech');
  const [audioModeBusy, setAudioModeBusy] = useState(false);
  const [audioModeSupported, setAudioModeSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [waitingLocked, setWaitingLocked] = useState(Boolean(initialLive.waiting_room_locked));
  const [entryRequests, setEntryRequests] = useState<EntryRequest[]>([]);
  const [admissionToken, setAdmissionToken] = useState<string | null>(null);
  const [waitingApproval, setWaitingApproval] = useState(false);

  const offers = initialLive.offers || [];
  const participantList = useMemo(() => Object.values(participants), [participants]);
  const remoteParticipants = participantList.filter((item: any) => !item.local);
  const localParticipant = participantList.find((item: any) => item.local);
  const hostParticipant = isHost ? localParticipant : remoteParticipants.find((item: any) => item.owner) || remoteParticipants[0];
  const featuredParticipant = featuredSessionId ? participantList.find((item: any) => item.session_id === featuredSessionId) : null;
  const activeSpeaker = activeSpeakerId ? participantList.find((item: any) => item.session_id === activeSpeakerId || item.user_id === activeSpeakerId) : null;
  const mainParticipant = featuredParticipant || (layout === 'auto' ? activeSpeaker : null) || hostParticipant || localParticipant || remoteParticipants[0];
  const thumbnailParticipants = participantList.filter((item: any) => item.session_id !== mainParticipant?.session_id);
  const screenSharer = participantList.find((participant: any) => Boolean(mediaTrack(participant, 'screenVideo')));
  const splitOfferVisible = Boolean(activeOffer && offerMode === 'split');
  const publicUrl = typeof window === 'undefined' ? `/live/${slug}` : new URL(`/live/${encodeURIComponent(slug)}`, window.location.origin).toString();

  useEffect(() => {
    const hostMode = new URLSearchParams(window.location.search).get('host') === '1';
    setIsHost(hostMode);
    if (hostMode) setName('Marcos Cruz');
    const savedAudioMode = window.localStorage.getItem('foco-live-audio-mode');
    if (savedAudioMode === 'music') setAudioMode('music');
    const goOnline = () => setOnline(true); const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); void callRef.current?.destroy?.(); };
  }, []);

  useEffect(() => {
    if (sidePanel === 'chat') {
      setUnreadChat(0);
      window.requestAnimationFrame(() => { const el = chatListRef.current; if (el) el.scrollTop = el.scrollHeight; });
    }
  }, [sidePanel, messages.length]);

  useEffect(() => {
    if (!isHost || !joined) return;
    const load = async () => {
      try {
        const response = await fetch(`/api/live/${slug}/entry-control`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        setWaitingLocked(Boolean(payload.locked));
        setEntryRequests(payload.requests || []);
      } catch {}
    };
    void load();
    const timer = window.setInterval(load, 3500);
    return () => window.clearInterval(timer);
  }, [isHost, joined, slug]);

  useEffect(() => {
    if (!waitingApproval || !admissionToken) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/live/${slug}/entry-request?requestId=${admissionToken}`, { cache: 'no-store' });
        const payload = await response.json();
        if (payload.status === 'approved') { window.clearInterval(timer); setWaitingApproval(false); void joinCall(admissionToken); }
        if (payload.status === 'denied') { window.clearInterval(timer); setWaitingApproval(false); setError('O apresentador não autorizou esta entrada.'); }
      } catch {}
    }, 2200);
    return () => window.clearInterval(timer);
  }, [waitingApproval, admissionToken, slug]);

  async function applyAudioMode(next: AudioMode, call = callRef.current) {
    setAudioMode(next); window.localStorage.setItem('foco-live-audio-mode', next);
    if (!call) return;
    setAudioModeBusy(true);
    try {
      const settings = { audio: { processor: { type: next === 'music' ? 'none' : 'noise-cancellation' } } };
      if (typeof call.updateInputSettings === 'function') await call.updateInputSettings(settings);
      else if (typeof call.setInputSettingsAsync === 'function') await call.setInputSettingsAsync(settings);
      else setAudioModeSupported(false);
    } catch { setAudioModeSupported(false); }
    finally { setAudioModeBusy(false); }
  }

  async function cleanupCall(call: any) { try { await call?.leave?.(); } catch {} try { await call?.destroy?.(); } catch {} if (callRef.current === call) callRef.current = null; }

  async function requestAdmission() {
    const response = await fetch(`/api/live/${slug}/entry-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, whatsapp }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível solicitar entrada.');
    if (payload.status === 'open') return joinCall();
    setAdmissionToken(payload.id); setWaitingApproval(true);
  }

  async function enter(event: FormEvent) {
    event.preventDefault(); if (joining) return;
    setJoining(true); setError('');
    try { await joinCall(); }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Erro ao entrar na live.';
      if (message.includes('Aguardando aprovação')) await requestAdmission(); else setError(message);
    } finally { setJoining(false); }
  }

  async function joinCall(token?: string) {
    let call: any = null;
    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/live/${slug}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ name, email, whatsapp, mode: isHost ? 'host' : 'guest', admissionToken: token }) });
      window.clearTimeout(abortTimer);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível entrar.');
      call = DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
      callRef.current = call;
      const sync = () => setParticipants({ ...call.participants() });
      ['participant-joined','participant-updated','participant-left','joined-meeting','track-started','track-stopped'].forEach((eventName) => call.on(eventName, sync));
      call.on('local-screen-share-started', () => { setScreenSharing(true); sync(); window.setTimeout(() => window.focus(), 250); });
      call.on('local-screen-share-stopped', () => { setScreenSharing(false); sync(); });
      call.on('recording-started', () => setRecording(true));
      call.on('recording-stopped', () => setRecording(false));
      call.on('active-speaker-change', (eventData: any) => setActiveSpeakerId(eventData?.activeSpeaker?.peerId || eventData?.activeSpeaker?.session_id || null));
      call.on('network-connection', (eventData: any) => { if (eventData?.event === 'interrupted') setOnline(false); if (eventData?.event === 'connected') setOnline(true); });
      call.on('app-message', async (eventData: any) => {
        const data = eventData?.data;
        if (data?.type === 'chat') {
          setMessages((current) => [...current, { id: crypto.randomUUID(), name: data.name || 'Participante', body: data.body }]);
          if (sidePanel !== 'chat') setUnreadChat((current) => current + 1);
        }
        if (data?.type === 'offer-display') { setActiveOffer(data.offer || null); setOfferMode(data.mode || 'hidden'); }
        if (data?.type === 'stage-focus') setFeaturedSessionId(data.sessionId || null);
        if (data?.type === 'moderation') {
          if (data.command === 'grant-audio') setCanSpeak(true);
          if (data.command === 'mute-audio') { setCanSpeak(false); await call.setLocalAudio(false); setMicOn(false); }
          if (data.command === 'grant-camera') setCanUseCamera(true);
          if (data.command === 'stop-camera') { setCanUseCamera(false); await call.setLocalVideo(false); setCameraOn(false); }
          if (data.command === 'leave') { await cleanupCall(call); setJoined(false); }
        }
        if (data?.type === 'live-ended') { setLiveStatus('ended'); window.setTimeout(() => { void cleanupCall(call); setJoined(false); setParticipants({}); }, 500); }
      });
      const userData = payload.participantProfile ? { avatar_url: payload.participantProfile.avatar_url, profile_id: payload.participantProfile.id } : undefined;
      await timeout(call.join({ url: payload.roomUrl, token: payload.token, userName: name, userData }), 25000, 'A conexão com a sala demorou demais. Tente novamente.');
      await timeout(call.setLocalAudio(true), 10000, 'Não foi possível preparar o microfone.');
      await timeout(call.setLocalVideo(true), 10000, 'Não foi possível preparar a câmera.');
      await applyAudioMode(audioMode, call);
      setMicOn(true); setCameraOn(true); sync();
      const saved = payload.live.offerConfig || {}; setActiveOffer(saved.offer || null); setOfferMode(saved.mode || 'hidden');
      setLiveStatus(payload.live.status); setWaitingLocked(Boolean(payload.live.waitingRoomLocked)); setJoined(true);
    } catch (reason) { window.clearTimeout(abortTimer); await cleanupCall(call); throw reason; }
  }

  async function control(action: 'start' | 'end') {
    const response = await fetch(`/api/live/${slug}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error || 'Não foi possível executar este comando.');
    if (action === 'start') setLiveStatus('live');
    if (action === 'end') { setLiveStatus('ended'); callRef.current?.sendAppMessage({ type: 'live-ended' }, '*'); }
  }

  async function displayOffer(offer: Offer | null, mode: OfferMode) {
    if (liveStatus === 'live') {
      const response = await fetch(`/api/live/${slug}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'offer', offer, mode, participantCount: participantList.length }) });
      if (!response.ok) return setError('Não foi possível exibir a oferta.');
      callRef.current?.sendAppMessage({ type: 'offer-display', offer, mode }, '*');
    }
    setActiveOffer(offer); setOfferMode(mode);
  }

  function moderate(sessionId: string, command: 'grant-audio' | 'mute-audio' | 'grant-camera' | 'stop-camera' | 'leave') { callRef.current?.sendAppMessage({ type: 'moderation', command }, sessionId); }
  function featureParticipant(sessionId: string | null) { setFeaturedSessionId(sessionId); callRef.current?.sendAppMessage({ type: 'stage-focus', sessionId }, '*'); }
  async function toggleMic() { if (!canSpeak) return setError('O apresentador bloqueou seu microfone.'); try { const next = !micOn; await callRef.current?.setLocalAudio(next); setMicOn(next); } catch { setError('Não foi possível acessar o microfone.'); } }
  async function toggleCamera() { if (!canUseCamera) return setError('O apresentador bloqueou sua câmera.'); try { const next = !cameraOn; await callRef.current?.setLocalVideo(next); setCameraOn(next); } catch { setError('Não foi possível acessar a câmera.'); } }
  async function toggleScreenShare() { try { if (screenSharing) await callRef.current?.stopScreenShare(); else { await callRef.current?.startScreenShare(); window.setTimeout(() => window.focus(), 350); } } catch { setError('Não foi possível compartilhar a tela neste dispositivo.'); } }
  function toggleHand() { const next = !raised; setRaised(next); callRef.current?.sendAppMessage({ type: 'hand', raised: next, name, sessionId: localParticipant?.session_id }, '*'); }
  function sendMessage(event: FormEvent) { event.preventDefault(); const body = chatText.trim(); if (!body) return; setMessages((current) => [...current, { id: crypto.randomUUID(), name: 'Você', body, mine: true }]); callRef.current?.sendAppMessage({ type: 'chat', name, body }, '*'); setChatText(''); }
  async function copyPublicLink() { await navigator.clipboard.writeText(publicUrl).catch(() => undefined); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  async function nativeShare() { if (!navigator.share) return copyPublicLink(); try { await navigator.share({ title: initialLive.title, url: publicUrl }); } catch {} }
  async function leave() { if (isHost && liveStatus === 'live') await control('end'); await cleanupCall(callRef.current); setJoined(false); setParticipants({}); }

  async function entryControl(action: 'lock'|'unlock'|'approve'|'deny'|'approve-all', requestId?: string) {
    const response = await fetch(`/api/live/${slug}/entry-control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, requestId }) });
    if (!response.ok) return setError('Não foi possível atualizar a sala de espera.');
    if (action === 'lock') setWaitingLocked(true);
    if (action === 'unlock') setWaitingLocked(false);
    if (action === 'approve-all') setEntryRequests([]);
    if (requestId) setEntryRequests((current) => current.filter((item) => item.id !== requestId));
  }

  async function toggleRecording() {
    const call = callRef.current;
    if (!call || recordingBusy) return;
    setRecordingBusy(true);
    try { if (recording) await call.stopRecording(); else await call.startRecording(); }
    catch { setError('Não foi possível alterar a gravação. Verifique se a gravação está habilitada nesta live.'); }
    finally { setRecordingBusy(false); }
  }

  if (!joined && liveStatus === 'ended') return <main className="fl-entry-shell"><section className="fl-entry-card"><h2>Transmissão encerrada</h2></section></main>;
  if (!joined) return <main className={`fl-entry-shell${isHost ? ' host-entry' : ''}`}><section className="fl-entry-card"><div className="fl-brand"><span>F</span><div><b>{isHost ? 'FOCO LIVE STUDIO' : 'FOCO LIVE'}</b><small>{initialLive.title}</small></div></div><h1>{initialLive.title}</h1><p className="fl-description">{waitingApproval ? 'Solicitação enviada. Aguarde o apresentador autorizar sua entrada.' : initialLive.description || 'Entre para acompanhar esta transmissão ao vivo.'}</p><form onSubmit={enter} className="fl-entry-form"><label>Como podemos chamar você?<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>{!isHost && initialLive.guest_fields?.email && <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}{!isHost && initialLive.guest_fields?.whatsapp && <label>WhatsApp<input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} /></label>}{error && <p className="fl-error">{error}</p>}<button disabled={joining || waitingApproval}>{waitingApproval ? 'Aguardando autorização…' : joining ? 'Preparando sua entrada…' : isHost ? 'Entrar no estúdio' : 'Entrar na live'}</button></form></section></main>;

  return <main className={`fl-room${isHost ? ' host-studio' : ''}${screenSharer ? ' is-presenting' : ''}${splitOfferVisible ? ' offer-split-active' : ''}`}>
    <header className="fl-topbar"><div className="fl-brand compact"><span>F</span><div><b>{isHost ? 'FOCO LIVE STUDIO' : 'FOCO LIVE'}</b><small>{initialLive.title}</small></div></div><div className={`fl-top-status${liveStatus !== 'live' ? ' waiting' : ''}`}><span className="fl-red-dot" /> {liveStatus === 'live' ? 'AO VIVO' : 'PRÉ-SALA'} <i>{participantList.length} presentes</i></div><div className="fl-top-actions">{isHost && <button className={`fl-recording-button${recording ? ' recording' : ''}`} disabled={recordingBusy} onClick={toggleRecording}><Circle size={14} fill={recording ? 'currentColor' : 'none'} />{recording ? 'Gravando' : 'Gravar'}</button>}<button className="fl-share-live-button" onClick={() => setShareOpen(true)}><Share2 size={16} /><span>Compartilhar</span></button><button className="fl-icon-button mobile-only" onClick={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')}><MessageCircle size={20} />{unreadChat > 0 && <b className="fl-unread-badge">{unreadChat}</b>}</button></div></header>
    <section className="fl-workspace"><div className="fl-stage-wrap">{participantList.length > 0 && !screenSharer && <div className="fl-native-layout-switcher"><button className={layout === 'class' ? 'active' : ''} onClick={() => setLayout('class')}><LayoutPanelTop size={16} /><span>Aula</span></button><button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')}><Grid2X2 size={16} /><span>Grade</span></button><button className={layout === 'auto' ? 'active' : ''} onClick={() => setLayout('auto')}><Sparkles size={16} /><span>Automático</span></button></div>}<section className={`fl-stage-content${splitOfferVisible ? ' has-split-offer' : ''}`}><div className="fl-stage-video-area">{screenSharer ? <><ScreenTile participant={screenSharer} />{mainParticipant && <div className="fl-presenter-pip"><VideoTile participant={mainParticipant} compact /></div>}</> : layout === 'grid' ? <section className={`fl-native-grid count-${Math.min(participantList.length, 12)}`}>{participantList.map((participant: any) => <VideoTile key={participant.session_id} participant={participant} speaking={participant.session_id === activeSpeaker?.session_id} />)}</section> : mainParticipant ? <section className="fl-speaker-layout"><div className="fl-speaker-main"><VideoTile participant={mainParticipant} speaking={mainParticipant.session_id === activeSpeaker?.session_id} /></div>{thumbnailParticipants.length > 0 && <div className="fl-speaker-thumbnails">{thumbnailParticipants.map((participant: any) => <VideoTile key={participant.session_id} participant={participant} compact />)}</div>}</section> : null}</div>{splitOfferVisible && activeOffer && <div className="fl-offer-card fl-offer-card-split"><OfferContent offer={activeOffer} /></div>}</section>{activeOffer && offerMode === 'banner' && <div className="fl-offer-banner"><OfferContent offer={activeOffer} compact /></div>}{activeOffer && offerMode === 'floating' && <a className="fl-offer-floating" href={absoluteUrl(activeOffer.checkout_url)} target="_blank" rel="noreferrer"><ShoppingBag size={18} />{activeOffer.name}</a>}{isHost && liveStatus !== 'live' && <div className="fl-host-start-overlay"><strong>Você ainda não está ao vivo.</strong><button onClick={() => control('start')}><Play size={18} /> Iniciar transmissão</button></div>}{error && <div className="fl-toast" onClick={() => setError('')}>{error}<X size={16} /></div>}</div>
      <aside className={`fl-sidepanel${sidePanel ? ' open' : ''}`}><div className="fl-tabs"><button className={sidePanel === 'chat' ? 'active' : ''} onClick={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')}><MessageCircle size={17} /> Chat{unreadChat > 0 && <b className="fl-unread-badge">{unreadChat}</b>}</button><button className={sidePanel === 'people' ? 'active' : ''} onClick={() => setSidePanel(sidePanel === 'people' ? null : 'people')}><Users size={17} /> Pessoas{entryRequests.length > 0 && <b className="fl-unread-badge">{entryRequests.length}</b>}</button>{isHost && <button className={sidePanel === 'director' ? 'active' : ''} onClick={() => setSidePanel(sidePanel === 'director' ? null : 'director')}><Layers size={17} /> Direção</button>}</div>
        {sidePanel === 'chat' ? <><div ref={chatListRef} className="fl-chat-list">{!messages.length && <div className="fl-chat-empty"><MessageCircle size={28} /><strong>O chat está aberto</strong></div>}{messages.map((message) => <div key={message.id} className={`fl-message${message.mine ? ' mine' : ''}`}><b>{message.name}</b><p>{message.body}</p></div>)}</div><form className="fl-chat-form" onSubmit={sendMessage}><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Escreva uma mensagem…" /><button><Send size={18} /></button></form></> : sidePanel === 'people' ? <div className="fl-people-list">{isHost && <div className="fl-entry-control"><strong>Sala de espera</strong><button onClick={() => entryControl(waitingLocked ? 'unlock' : 'lock')}>{waitingLocked ? 'Permitir entrada automática' : 'Exigir aprovação'}</button>{entryRequests.length > 1 && <button onClick={() => entryControl('approve-all')}>Aceitar todos</button>}{entryRequests.map((request) => <div key={request.id} className="fl-entry-request"><span>{request.guest_name}</span><button onClick={() => entryControl('approve', request.id)}>Aceitar</button><button className="danger" onClick={() => entryControl('deny', request.id)}>Negar</button></div>)}</div>}{participantList.map((participant: any) => { const id = participant.session_id; const avatar = participantAvatar(participant); return <div key={id}>{avatar ? <img src={avatar} alt="" /> : <span>{(participant.user_name || 'P').slice(0,1).toUpperCase()}</span>}<div><b>{participant.user_name || 'Participante'}</b><small>{participant.local ? 'Você' : 'Na sala'}</small></div>{isHost && !participant.local && <div className="fl-person-actions"><button onClick={() => featureParticipant(featuredSessionId === id ? null : id)}><Star size={14} /></button><button onClick={() => moderate(id, participant.audio === false ? 'grant-audio' : 'mute-audio')}>{participant.audio === false ? <Mic size={14} /> : <MicOff size={14} />}</button><button onClick={() => moderate(id, participant.video === false ? 'grant-camera' : 'stop-camera')}>{participant.video === false ? <Video size={14} /> : <CameraOff size={14} />}</button><button className="danger" onClick={() => moderate(id, 'leave')}><UserMinus size={14} /></button></div>}</div>; })}</div> : sidePanel === 'director' ? <div className="fl-director-panel"><span>DIREÇÃO AO VIVO</span><div className="fl-director-audio"><strong>Perfil de áudio</strong><div className="fl-audio-mode"><button className={audioMode === 'speech' ? 'active' : ''} disabled={audioModeBusy} onClick={() => applyAudioMode('speech')}><Mic2 size={16} />Fala</button><button className={audioMode === 'music' ? 'active music' : ''} disabled={audioModeBusy} onClick={() => applyAudioMode('music')}><Music2 size={16} />Modo música</button></div>{!audioModeSupported && <small>Processamento padrão mantido.</small>}</div><div className="fl-director-offers"><strong>OFERTAS DESTA LIVE</strong>{offers.map((item) => <article key={item.id}><div><b>{item.name}</b><small>{item.price || item.headline}</small></div><button className={activeOffer?.id === item.id && offerMode === 'split' ? 'active-offer-mode' : ''} onClick={() => displayOffer(item, 'split')}>Tela dividida</button><button className={activeOffer?.id === item.id && offerMode === 'banner' ? 'active-offer-mode' : ''} onClick={() => displayOffer(item, 'banner')}>CTA</button><button className={activeOffer?.id === item.id && offerMode === 'floating' ? 'active-offer-mode' : ''} onClick={() => displayOffer(item, 'floating')}>Botão</button></article>)}{activeOffer && <button className="danger" onClick={() => displayOffer(null, 'hidden')}><X size={17} /> Ocultar oferta</button>}</div>{liveStatus === 'live' ? <button className="danger" onClick={() => control('end')}><Square size={18} /> Encerrar transmissão</button> : <button onClick={() => control('start')}><Play size={18} /> Iniciar transmissão</button>}</div> : <div />}
      </aside></section>
    <footer className="fl-controls"><button onClick={toggleMic} className={!micOn ? 'off' : ''}>{micOn ? <Mic /> : <MicOff />}<span>{micOn ? 'Microfone' : 'Ativar mic'}</span></button><button onClick={toggleCamera} className={!cameraOn ? 'off' : ''}>{cameraOn ? <Camera /> : <CameraOff />}<span>{cameraOn ? 'Câmera' : 'Ativar câmera'}</span></button><button onClick={toggleScreenShare} className={screenSharing ? 'active' : ''}><MonitorUp /><span>{screenSharing ? 'Parar apresentação' : 'Apresentar agora'}</span></button>{!isHost && <button onClick={toggleHand} className={raised ? 'active gold' : ''}><Hand /><span>{raised ? 'Mão levantada' : 'Levantar mão'}</span></button>}{isHost && <button onClick={() => setSidePanel(sidePanel === 'director' ? null : 'director')} className="active"><Layers /><span>Direção</span></button>}<button onClick={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')} className="desktop-only"><MessageCircle /><span>Chat</span>{unreadChat > 0 && <b className="fl-unread-badge">{unreadChat}</b>}</button><button onClick={leave} className="danger"><LogOut /><span>Sair</span></button></footer>
    {shareOpen && <div className="fl-share-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShareOpen(false); }}><section className="fl-share-modal"><button className="fl-share-close" onClick={() => setShareOpen(false)}>×</button><span>CONVIDAR PARTICIPANTES</span><h2>Compartilhar live</h2><div className="fl-share-link-row"><input readOnly value={publicUrl} /><button onClick={copyPublicLink}><Copy size={15} />{copied ? 'Copiado!' : 'Copiar só o link'}</button></div><div className="fl-share-actions"><button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Você está convidado para ${initialLive.title}\n${publicUrl}`)}`, '_blank')}>WhatsApp</button><button className="secondary" onClick={nativeShare}>Mais opções</button></div></section></div>}
  </main>;
}
