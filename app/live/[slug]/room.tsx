'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { Camera, CameraOff, Hand, Layers, LogOut, MessageCircle, Mic, MicOff, MonitorUp, Play, Send, ShoppingBag, Square, Users, X } from 'lucide-react';

type Offer = {
  id: string;
  name: string;
  headline?: string | null;
  description?: string | null;
  price?: string | null;
  old_price?: string | null;
  checkout_url: string;
  cta_label?: string | null;
  image_url?: string | null;
  badge?: string | null;
};

type OfferMode = 'hidden' | 'split' | 'banner' | 'floating';

type Live = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  access_type: string;
  guest_access_enabled: boolean;
  guest_fields?: { name?: boolean; email?: boolean; whatsapp?: boolean };
  starts_at?: string | null;
  current_scene?: string;
  offer_config?: Record<string, any>;
  offers?: Offer[];
};

type ChatMessage = { id: string; name: string; body: string; mine?: boolean };
type Props = { slug: string; initialLive: Live };

function VideoTile({ participant, featured = false }: { participant: any; featured?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoTrack = participant?.tracks?.video?.persistentTrack || participant?.videoTrack;
  const audioTrack = participant?.tracks?.audio?.persistentTrack || participant?.audioTrack;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
      videoRef.current.play().catch(() => undefined);
    }
  }, [videoTrack]);

  useEffect(() => {
    if (!participant?.local && audioRef.current) {
      audioRef.current.srcObject = audioTrack ? new MediaStream([audioTrack]) : null;
      audioRef.current.play().catch(() => undefined);
    }
  }, [audioTrack, participant?.local]);

  const name = participant?.user_name || (participant?.local ? 'Você' : 'Participante');
  const cameraOn = participant?.video !== false && Boolean(videoTrack);
  const micOn = participant?.audio !== false;

  return (
    <article className={`fl-video-tile${featured ? ' featured' : ''}`}>
      {cameraOn ? <video ref={videoRef} autoPlay playsInline muted={Boolean(participant?.local)} /> : <div className="fl-avatar">{name.slice(0, 1).toUpperCase()}</div>}
      {!participant?.local && <audio ref={audioRef} autoPlay />}
      <div className="fl-video-meta"><span>{name}</span><i>{micOn ? <Mic size={14} /> : <MicOff size={14} />}</i></div>
    </article>
  );
}

function OfferContent({ offer, compact = false }: { offer: Offer; compact?: boolean }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(offer.checkout_url)}`;
  return (
    <div className={`fl-live-offer-content${compact ? ' compact' : ''}`}>
      <span>{offer.badge || 'Oferta especial'}</span>
      <h2>{offer.headline || offer.name}</h2>
      {!compact && offer.description && <p>{offer.description}</p>}
      <div className="fl-live-offer-price">
        {offer.old_price && <del>{offer.old_price}</del>}
        {offer.price && <strong>{offer.price}</strong>}
      </div>
      {!compact && <img src={qrUrl} alt={`QR Code para ${offer.name}`} />}
      <a href={offer.checkout_url} target="_blank" rel="noreferrer">{offer.cta_label || 'Quero garantir minha vaga'}</a>
    </div>
  );
}

export default function FocoLiveRoom({ slug, initialLive }: Props) {
  const callRef = useRef<any>(null);
  const [isHost, setIsHost] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [liveStatus, setLiveStatus] = useState(initialLive.status);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [participants, setParticipants] = useState<Record<string, any>>({});
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [raised, setRaised] = useState(false);
  const [sidePanel, setSidePanel] = useState<'chat' | 'people' | 'director' | null>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [scene, setScene] = useState(initialLive.current_scene || 'waiting');
  const [activeOffer, setActiveOffer] = useState<Offer | null>(null);
  const [offerMode, setOfferMode] = useState<OfferMode>('hidden');

  const offers = initialLive.offers || [];
  const participantList = useMemo(() => Object.values(participants), [participants]);
  const remoteParticipants = participantList.filter((item: any) => !item.local);
  const localParticipant = participantList.find((item: any) => item.local);

  useEffect(() => {
    const hostMode = new URLSearchParams(window.location.search).get('host') === '1';
    setIsHost(hostMode);
    if (hostMode) setName('Marcos Cruz');
    return () => { callRef.current?.destroy?.(); };
  }, []);

  async function enter(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setError('');
    try {
      const response = await fetch(`/api/live/${slug}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, whatsapp, mode: isHost ? 'host' : 'guest' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível entrar.');

      const call = DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
      callRef.current = call;
      const sync = () => setParticipants({ ...call.participants() });
      call.on('participant-joined', sync);
      call.on('participant-updated', sync);
      call.on('participant-left', sync);
      call.on('joined-meeting', sync);
      call.on('app-message', (eventData: any) => {
        const data = eventData?.data;
        if (data?.type === 'chat') setMessages((current) => [...current, { id: crypto.randomUUID(), name: data.name || 'Participante', body: data.body }]);
        if (data?.type === 'scene') setScene(data.scene || 'class');
        if (data?.type === 'offer-display') {
          setActiveOffer(data.offer || null);
          setOfferMode(data.mode || 'hidden');
        }
        if (data?.type === 'live-ended') setLiveStatus('ended');
      });
      await call.join({ url: payload.roomUrl, token: payload.token, userName: name });
      sync();
      setScene(payload.live.currentScene || scene);
      setLiveStatus(payload.live.status);
      setJoined(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erro ao entrar na live.');
    } finally {
      setJoining(false);
    }
  }

  async function control(action: 'start' | 'end' | 'scene', nextScene?: string) {
    setError('');
    const response = await fetch(`/api/live/${slug}/control`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'scene' ? { action, scene: nextScene } : { action }),
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error || 'Não foi possível executar este comando.');
    if (action === 'start') {
      setLiveStatus('live');
      setScene('class');
      callRef.current?.sendAppMessage({ type: 'scene', scene: 'class' }, '*');
    }
    if (action === 'end') {
      setLiveStatus('ended');
      callRef.current?.sendAppMessage({ type: 'live-ended' }, '*');
    }
    if (action === 'scene' && nextScene) {
      setScene(nextScene);
      callRef.current?.sendAppMessage({ type: 'scene', scene: nextScene }, '*');
    }
  }

  function displayOffer(offer: Offer | null, mode: OfferMode) {
    setActiveOffer(offer);
    setOfferMode(mode);
    if (mode === 'split') setScene('offer');
    else if (scene === 'offer') setScene('class');
    callRef.current?.sendAppMessage({ type: 'offer-display', offer, mode }, '*');
    callRef.current?.sendAppMessage({ type: 'scene', scene: mode === 'split' ? 'offer' : 'class' }, '*');
  }

  async function toggleMic() { const next = !micOn; await callRef.current?.setLocalAudio(next); setMicOn(next); }
  async function toggleCamera() { const next = !cameraOn; await callRef.current?.setLocalVideo(next); setCameraOn(next); }
  async function toggleShare() {
    try {
      if (sharing) await callRef.current?.stopScreenShare(); else await callRef.current?.startScreenShare();
      setSharing(!sharing);
      if (!sharing && isHost) await control('scene', 'screen');
    } catch { setError('Não foi possível compartilhar a tela neste dispositivo.'); }
  }
  function toggleHand() { const next = !raised; setRaised(next); callRef.current?.sendAppMessage({ type: 'hand', raised: next, name }, '*'); }
  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = chatText.trim();
    if (!body) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), name: 'Você', body, mine: true }]);
    callRef.current?.sendAppMessage({ type: 'chat', name, body }, '*');
    setChatText('');
  }
  async function leave() {
    await callRef.current?.leave();
    await callRef.current?.destroy();
    callRef.current = null;
    setJoined(false);
    setParticipants({});
  }

  if (!joined) {
    return (
      <main className={`fl-entry-shell${isHost ? ' host-entry' : ''}`}>
        <div className="fl-entry-glow one" /><div className="fl-entry-glow two" />
        <section className="fl-entry-card">
          <div className="fl-brand"><span>F</span><div><b>{isHost ? 'FOCO LIVE STUDIO' : 'FOCO LIVE'}</b><small>{isHost ? 'Ambiente do apresentador' : 'por Foco em Canto'}</small></div></div>
          <div className={`fl-live-badge${isHost ? ' host' : ''}`}>{isHost ? 'HOST' : liveStatus === 'live' ? 'AO VIVO' : 'AGUARDANDO'}</div>
          <p className="fl-kicker">{isHost ? 'Prepare sua transmissão' : 'Uma experiência vocal ao vivo'}</p>
          <h1>{initialLive.title}</h1>
          <p className="fl-description">{isHost ? 'Entre no estúdio, confira câmera e microfone e inicie a transmissão quando estiver pronto.' : initialLive.description || 'Entre para acompanhar esta transmissão ao vivo.'}</p>
          <form onSubmit={enter} className="fl-entry-form">
            <label>{isHost ? 'Nome do apresentador' : 'Como podemos chamar você?'}<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" required minLength={2} /></label>
            {!isHost && initialLive.guest_fields?.email && <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label>}
            {!isHost && initialLive.guest_fields?.whatsapp && <label>WhatsApp<input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="(71) 99999-9999" /></label>}
            {error && <p className="fl-error">{error}</p>}
            <button disabled={joining}>{joining ? 'Preparando sua entrada…' : isHost ? 'Entrar no estúdio' : 'Entrar na live'}</button>
          </form>
          <div className="fl-entry-foot"><span>🔒 Sala protegida</span><span>{isHost ? '🎬 Controles exclusivos do host' : '🎧 Use fones para uma experiência melhor'}</span></div>
        </section>
      </main>
    );
  }

  const stagePeople = remoteParticipants.length ? remoteParticipants : localParticipant ? [localParticipant] : [];

  return (
    <main className={`fl-room scene-${scene}${isHost ? ' host-studio' : ''}`}>
      <header className="fl-topbar">
        <div className="fl-brand compact"><span>F</span><div><b>{isHost ? 'FOCO LIVE STUDIO' : 'FOCO LIVE'}</b><small>{initialLive.title}</small></div></div>
        <div className={`fl-top-status${liveStatus !== 'live' ? ' waiting' : ''}`}><span className="fl-red-dot" /> {liveStatus === 'live' ? 'AO VIVO' : liveStatus === 'ended' ? 'ENCERRADA' : 'PRÉ-SALA'} <i>{participantList.length} presentes</i></div>
        <button className="fl-icon-button mobile-only" onClick={() => setSidePanel(sidePanel ? null : 'chat')}><MessageCircle size={20} /></button>
      </header>

      <section className="fl-workspace">
        <div className="fl-stage-wrap">
          {scene === 'offer' && activeOffer ? (
            <section className="fl-offer-scene">
              <div className="fl-offer-video">{stagePeople[0] && <VideoTile participant={stagePeople[0]} featured />}</div>
              <div className="fl-offer-card"><OfferContent offer={activeOffer} /></div>
            </section>
          ) : (
            <section className={`fl-stage-grid count-${Math.min(stagePeople.length, 4)}`}>
              {stagePeople.map((participant: any, index) => <VideoTile key={participant.session_id || index} participant={participant} featured={stagePeople.length === 1} />)}
              {!stagePeople.length && <div className="fl-waiting-stage"><div className="fl-pulse-logo">F</div><h2>{isHost ? 'Seu estúdio está pronto' : 'A transmissão está sendo preparada'}</h2><p>{isHost ? 'Ative câmera e microfone e inicie quando estiver pronto.' : 'Você já está na sala. Aguarde só mais um instante.'}</p></div>}
            </section>
          )}

          {activeOffer && offerMode === 'banner' && <div className="fl-offer-banner"><OfferContent offer={activeOffer} compact /></div>}
          {activeOffer && offerMode === 'floating' && <a className="fl-offer-floating" href={activeOffer.checkout_url} target="_blank" rel="noreferrer"><ShoppingBag size={18} /><span><small>{activeOffer.badge || 'Oferta especial'}</small><strong>{activeOffer.name}</strong></span></a>}
          {isHost && liveStatus !== 'live' && liveStatus !== 'ended' && <div className="fl-host-start-overlay"><span>PRÉ-SALA DO HOST</span><strong>Você ainda não está ao vivo.</strong><button onClick={() => control('start')}><Play size={18} /> Iniciar transmissão</button></div>}
          {error && <div className="fl-toast" onClick={() => setError('')}>{error}<X size={16} /></div>}
        </div>

        <aside className={`fl-sidepanel${sidePanel ? ' open' : ''}`}>
          <div className="fl-tabs">
            <button className={sidePanel === 'chat' ? 'active' : ''} onClick={() => setSidePanel('chat')}><MessageCircle size={17} /> Chat</button>
            <button className={sidePanel === 'people' ? 'active' : ''} onClick={() => setSidePanel('people')}><Users size={17} /> Pessoas</button>
            {isHost && <button className={sidePanel === 'director' ? 'active' : ''} onClick={() => setSidePanel('director')}><Layers size={17} /> Direção</button>}
          </div>
          {sidePanel === 'chat' ? <><div className="fl-chat-list">{!messages.length && <div className="fl-chat-empty"><MessageCircle size={28} /><strong>O chat está aberto</strong><p>Envie uma mensagem para a turma.</p></div>}{messages.map((message) => <div key={message.id} className={`fl-message${message.mine ? ' mine' : ''}`}><b>{message.name}</b><p>{message.body}</p></div>)}</div><form className="fl-chat-form" onSubmit={sendMessage}><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Escreva uma mensagem…" /><button><Send size={18} /></button></form></> : sidePanel === 'people' ? <div className="fl-people-list">{participantList.map((participant: any) => <div key={participant.session_id}><span>{(participant.user_name || 'P').slice(0, 1).toUpperCase()}</span><div><b>{participant.user_name || 'Participante'}</b><small>{participant.local ? 'Você' : 'Na sala'}</small></div>{participant.audio === false ? <MicOff size={15} /> : <Mic size={15} />}</div>)}</div> : <div className="fl-director-panel">
            <span>DIREÇÃO AO VIVO</span><h3>Controle o que todos veem</h3>
            <button onClick={() => control('scene', 'class')}><Layers size={18} /> Modo aula</button>
            <button onClick={() => control('scene', 'screen')}><MonitorUp size={18} /> Apresentação</button>
            <div className="fl-director-offers">
              <strong>OFERTAS DESTA LIVE</strong>
              {offers.length === 0 ? <p>Nenhuma oferta vinculada. Configure no admin da live.</p> : offers.map((item) => (
                <article key={item.id}>
                  <div><b>{item.name}</b><small>{item.price || item.headline}</small></div>
                  <button onClick={() => displayOffer(item, 'split')}>Tela dividida</button>
                  <button onClick={() => displayOffer(item, 'banner')}>CTA na tela</button>
                  <button onClick={() => displayOffer(item, 'floating')}>Botão</button>
                </article>
              ))}
              {activeOffer && <button className="danger" onClick={() => displayOffer(null, 'hidden')}><X size={17} /> Ocultar oferta</button>}
            </div>
            {liveStatus === 'live' ? <button className="danger" onClick={() => control('end')}><Square size={18} /> Encerrar transmissão</button> : <button onClick={() => control('start')}><Play size={18} /> Iniciar transmissão</button>}
          </div>}
        </aside>
      </section>

      <footer className="fl-controls">
        <button onClick={toggleMic} className={!micOn ? 'off' : ''}>{micOn ? <Mic /> : <MicOff />}<span>{micOn ? 'Microfone' : 'Ativar mic'}</span></button>
        <button onClick={toggleCamera} className={!cameraOn ? 'off' : ''}>{cameraOn ? <Camera /> : <CameraOff />}<span>{cameraOn ? 'Câmera' : 'Ativar câmera'}</span></button>
        <button onClick={toggleShare} className={sharing ? 'active' : ''}><MonitorUp /><span>{sharing ? 'Parar tela' : 'Compartilhar'}</span></button>
        {!isHost && <button onClick={toggleHand} className={raised ? 'active gold' : ''}><Hand /><span>{raised ? 'Mão levantada' : 'Levantar mão'}</span></button>}
        {isHost && <button onClick={() => setSidePanel(sidePanel === 'director' ? null : 'director')} className="active"><Layers /><span>Direção</span></button>}
        <button onClick={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')} className="desktop-only"><MessageCircle /><span>Chat</span></button>
        <button onClick={leave} className="danger"><LogOut /><span>Sair</span></button>
      </footer>
    </main>
  );
}
