'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { Camera, CameraOff, Hand, LogOut, MessageCircle, Mic, MicOff, MonitorUp, Send, Users, X } from 'lucide-react';

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

export default function FocoLiveRoom({ slug, initialLive }: Props) {
  const callRef = useRef<any>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [participants, setParticipants] = useState<Record<string, any>>({});
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [raised, setRaised] = useState(false);
  const [sidePanel, setSidePanel] = useState<'chat' | 'people' | null>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [scene, setScene] = useState(initialLive.current_scene || 'waiting');
  const [offer, setOffer] = useState<Record<string, any>>(initialLive.offer_config || {});

  const participantList = useMemo(() => Object.values(participants), [participants]);
  const remoteParticipants = participantList.filter((item: any) => !item.local);
  const localParticipant = participantList.find((item: any) => item.local);

  useEffect(() => () => { callRef.current?.destroy?.(); }, []);

  async function enter(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setError('');
    try {
      const response = await fetch(`/api/live/${slug}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, whatsapp, mode: 'guest' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível entrar.');

      const call = DailyIframe.createCallObject({
        subscribeToTracksAutomatically: true,
      });
      callRef.current = call;
      const sync = () => setParticipants({ ...call.participants() });
      call.on('participant-joined', sync);
      call.on('participant-updated', sync);
      call.on('participant-left', sync);
      call.on('joined-meeting', sync);
      call.on('app-message', (eventData: any) => {
        const data = eventData?.data;
        if (data?.type === 'chat') {
          setMessages((current) => [...current, { id: crypto.randomUUID(), name: data.name || 'Participante', body: data.body }]);
        }
        if (data?.type === 'scene') {
          setScene(data.scene || 'class');
          if (data.offer) setOffer(data.offer);
        }
      });
      await call.join({ url: payload.roomUrl, token: payload.token, userName: name });
      sync();
      setScene(payload.live.currentScene || scene);
      setOffer(payload.live.offerConfig || offer);
      setJoined(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erro ao entrar na live.');
    } finally {
      setJoining(false);
    }
  }

  async function toggleMic() {
    const next = !micOn;
    await callRef.current?.setLocalAudio(next);
    setMicOn(next);
  }

  async function toggleCamera() {
    const next = !cameraOn;
    await callRef.current?.setLocalVideo(next);
    setCameraOn(next);
  }

  async function toggleShare() {
    try {
      if (sharing) await callRef.current?.stopScreenShare();
      else await callRef.current?.startScreenShare();
      setSharing(!sharing);
    } catch {
      setError('Não foi possível compartilhar a tela neste dispositivo.');
    }
  }

  function toggleHand() {
    const next = !raised;
    setRaised(next);
    callRef.current?.sendAppMessage({ type: 'hand', raised: next, name }, '*');
  }

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
      <main className="fl-entry-shell">
        <div className="fl-entry-glow one" /><div className="fl-entry-glow two" />
        <section className="fl-entry-card">
          <div className="fl-brand"><span>F</span><div><b>FOCO LIVE</b><small>por Foco em Canto</small></div></div>
          <div className="fl-live-badge">AO VIVO</div>
          <p className="fl-kicker">Uma experiência vocal ao vivo</p>
          <h1>{initialLive.title}</h1>
          <p className="fl-description">{initialLive.description || 'Entre para acompanhar esta transmissão ao vivo.'}</p>
          <form onSubmit={enter} className="fl-entry-form">
            <label>Como podemos chamar você?<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" required minLength={2} /></label>
            {initialLive.guest_fields?.email && <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label>}
            {initialLive.guest_fields?.whatsapp && <label>WhatsApp<input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="(71) 99999-9999" /></label>}
            {error && <p className="fl-error">{error}</p>}
            <button disabled={joining}>{joining ? 'Preparando sua entrada…' : 'Entrar na live'}</button>
          </form>
          <div className="fl-entry-foot"><span>🔒 Sala protegida</span><span>🎧 Use fones para uma experiência melhor</span></div>
        </section>
      </main>
    );
  }

  const stagePeople = remoteParticipants.length ? remoteParticipants : localParticipant ? [localParticipant] : [];

  return (
    <main className={`fl-room scene-${scene}`}>
      <header className="fl-topbar">
        <div className="fl-brand compact"><span>F</span><div><b>FOCO LIVE</b><small>{initialLive.title}</small></div></div>
        <div className="fl-top-status"><span className="fl-red-dot" /> AO VIVO <i>{participantList.length} presentes</i></div>
        <button className="fl-icon-button mobile-only" onClick={() => setSidePanel(sidePanel ? null : 'chat')}><MessageCircle size={20} /></button>
      </header>

      <section className="fl-workspace">
        <div className="fl-stage-wrap">
          {scene === 'offer' ? (
            <section className="fl-offer-scene">
              <div className="fl-offer-video">{stagePeople[0] && <VideoTile participant={stagePeople[0]} featured />}</div>
              <div className="fl-offer-card">
                <span className="fl-kicker">Condição especial liberada</span>
                <h2>{offer.title || 'Foco em Canto Premium'}</h2>
                <p>{offer.description || 'Uma oportunidade especial para quem está acompanhando esta live.'}</p>
                {offer.price && <strong className="fl-price">{offer.price}</strong>}
                {offer.qrCodeUrl && <img className="fl-qr" src={offer.qrCodeUrl} alt="QR Code da oferta" />}
                {offer.url && <a href={offer.url} target="_blank" rel="noreferrer">Garantir minha vaga</a>}
              </div>
            </section>
          ) : (
            <section className={`fl-stage-grid count-${Math.min(stagePeople.length, 4)}`}>
              {stagePeople.map((participant: any, index) => <VideoTile key={participant.session_id || index} participant={participant} featured={stagePeople.length === 1} />)}
              {!stagePeople.length && <div className="fl-waiting-stage"><div className="fl-pulse-logo">F</div><h2>A transmissão está sendo preparada</h2><p>Você já está na sala. Aguarde só mais um instante.</p></div>}
            </section>
          )}
          {error && <div className="fl-toast" onClick={() => setError('')}>{error}<X size={16} /></div>}
        </div>

        <aside className={`fl-sidepanel${sidePanel ? ' open' : ''}`}>
          <div className="fl-tabs">
            <button className={sidePanel === 'chat' ? 'active' : ''} onClick={() => setSidePanel('chat')}><MessageCircle size={17} /> Chat</button>
            <button className={sidePanel === 'people' ? 'active' : ''} onClick={() => setSidePanel('people')}><Users size={17} /> Pessoas</button>
          </div>
          {sidePanel === 'chat' ? <>
            <div className="fl-chat-list">
              {!messages.length && <div className="fl-chat-empty"><MessageCircle size={28} /><strong>O chat está aberto</strong><p>Envie uma mensagem para a turma.</p></div>}
              {messages.map((message) => <div key={message.id} className={`fl-message${message.mine ? ' mine' : ''}`}><b>{message.name}</b><p>{message.body}</p></div>)}
            </div>
            <form className="fl-chat-form" onSubmit={sendMessage}><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Escreva uma mensagem…" /><button><Send size={18} /></button></form>
          </> : <div className="fl-people-list">{participantList.map((participant: any) => <div key={participant.session_id}><span>{(participant.user_name || 'P').slice(0, 1).toUpperCase()}</span><div><b>{participant.user_name || 'Participante'}</b><small>{participant.local ? 'Você' : 'Na sala'}</small></div>{participant.audio === false ? <MicOff size={15} /> : <Mic size={15} />}</div>)}</div>}
        </aside>
      </section>

      <footer className="fl-controls">
        <button onClick={toggleMic} className={!micOn ? 'off' : ''}>{micOn ? <Mic /> : <MicOff />}<span>{micOn ? 'Microfone' : 'Ativar mic'}</span></button>
        <button onClick={toggleCamera} className={!cameraOn ? 'off' : ''}>{cameraOn ? <Camera /> : <CameraOff />}<span>{cameraOn ? 'Câmera' : 'Ativar câmera'}</span></button>
        <button onClick={toggleShare} className={sharing ? 'active' : ''}><MonitorUp /><span>{sharing ? 'Parar tela' : 'Compartilhar'}</span></button>
        <button onClick={toggleHand} className={raised ? 'active gold' : ''}><Hand /><span>{raised ? 'Mão levantada' : 'Levantar mão'}</span></button>
        <button onClick={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')} className="desktop-only"><MessageCircle /><span>Chat</span></button>
        <button onClick={leave} className="danger"><LogOut /><span>Sair</span></button>
      </footer>
    </main>
  );
}
