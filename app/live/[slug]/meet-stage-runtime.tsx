'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Grid2X2, LayoutPanelTop, Sparkles } from 'lucide-react';

type LayoutMode = 'class' | 'grid' | 'auto';
type Participant = any;

function ParticipantVideo({ participant, compact = false, active = false }: { participant: Participant; compact?: boolean; active?: boolean }) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const videoTrack = participant?.tracks?.video?.persistentTrack || participant?.videoTrack;
  const audioTrack = participant?.tracks?.audio?.persistentTrack || participant?.audioTrack;
  const name = participant?.user_name || (participant?.local ? 'Você' : 'Participante');
  const cameraOn = participant?.video !== false && Boolean(videoTrack);
  const micOn = participant?.audio !== false;

  useEffect(() => {
    if (!videoEl) return;
    const stream = videoTrack ? new MediaStream([videoTrack]) : null;
    videoEl.srcObject = stream;
    if (stream) void videoEl.play().catch(() => undefined);
    return () => {
      if (videoEl.srcObject === stream) videoEl.srcObject = null;
    };
  }, [videoEl, videoTrack]);

  useEffect(() => {
    if (!audioEl || participant?.local) return;
    const stream = audioTrack ? new MediaStream([audioTrack]) : null;
    audioEl.srcObject = stream;
    if (stream) void audioEl.play().catch(() => undefined);
    return () => {
      if (audioEl.srcObject === stream) audioEl.srcObject = null;
    };
  }, [audioEl, audioTrack, participant?.local]);

  return (
    <article className={`fl-meet-tile${compact ? ' compact' : ''}${active ? ' speaking' : ''}`}>
      {cameraOn ? <video ref={setVideoEl} autoPlay playsInline muted={Boolean(participant?.local)} /> : <div className="fl-meet-avatar">{name.slice(0, 1).toUpperCase()}</div>}
      {!participant?.local && <audio ref={setAudioEl} autoPlay />}
      <div className="fl-meet-meta"><span>{name}{participant?.local ? ' (você)' : ''}</span><i>{micOn ? '●' : '⌁'}</i></div>
    </article>
  );
}

export default function MeetStageRuntime() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [layout, setLayout] = useState<LayoutMode>('class');
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let call: any = null;
    let discoveryTimer = 0;
    let disposed = false;

    const syncParticipants = () => {
      if (!call || disposed) return;
      try { setParticipants({ ...call.participants() }); } catch { /* chamada encerrando */ }
    };

    const onActiveSpeaker = (event: any) => {
      setActiveSpeakerId(event?.activeSpeaker?.peerId || event?.activeSpeaker?.session_id || null);
    };

    const bindAfterJoin = () => {
      const stage = document.querySelector<HTMLElement>('.fl-stage-wrap');
      const nextCall = (window as any).__focoLiveCall;
      if (stage) setMount(stage);
      setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
      if (!stage || !nextCall) return false;

      // Fundamental: este runtime só observa a chamada depois que o FocoLiveRoom
      // terminou o join. Assim ele não concorre com a abertura da sala.
      if (nextCall.meetingState?.() !== 'joined-meeting') return false;

      call = nextCall;
      call.on('participant-joined', syncParticipants);
      call.on('participant-updated', syncParticipants);
      call.on('participant-left', syncParticipants);
      call.on('active-speaker-change', onActiveSpeaker);
      syncParticipants();
      setEnabled(true);
      return true;
    };

    if (!bindAfterJoin()) {
      discoveryTimer = window.setInterval(() => {
        if (bindAfterJoin()) window.clearInterval(discoveryTimer);
      }, 350);
    }

    return () => {
      disposed = true;
      window.clearInterval(discoveryTimer);
      if (call) {
        call.off?.('participant-joined', syncParticipants);
        call.off?.('participant-updated', syncParticipants);
        call.off?.('participant-left', syncParticipants);
        call.off?.('active-speaker-change', onActiveSpeaker);
      }
      setEnabled(false);
    };
  }, []);

  useEffect(() => {
    if (!mount) return;
    mount.classList.toggle('meet-stage-active', enabled);
    return () => mount.classList.remove('meet-stage-active');
  }, [mount, enabled]);

  const list = useMemo(() => Object.values(participants), [participants]);
  const local = list.find((item: any) => item.local);
  const remote = list.filter((item: any) => !item.local);
  const hostParticipant = isHost ? local : remote.find((item: any) => item.owner) || remote[0];
  const activeSpeaker = list.find((item: any) => item.session_id === activeSpeakerId || item.user_id === activeSpeakerId);
  const main = layout === 'auto' && activeSpeaker && !activeSpeaker.local ? activeSpeaker : hostParticipant || local || remote[0];
  const thumbs = list.filter((item: any) => item.session_id !== main?.session_id);

  if (!mount || !enabled || !list.length) return null;

  return createPortal(
    <div className={`fl-meet-stage layout-${layout}`}>
      {isHost && (
        <div className="fl-meet-layout-switcher" aria-label="Layout da transmissão">
          <button className={layout === 'class' ? 'active' : ''} onClick={() => setLayout('class')} title="Professor em destaque"><LayoutPanelTop size={16} /><span>Aula</span></button>
          <button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} title="Grade com todos"><Grid2X2 size={16} /><span>Grade</span></button>
          <button className={layout === 'auto' ? 'active' : ''} onClick={() => setLayout('auto')} title="Alternar por quem fala"><Sparkles size={16} /><span>Automático</span></button>
        </div>
      )}

      {layout === 'grid' ? (
        <section className={`fl-meet-grid count-${Math.min(list.length, 9)}`}>
          {list.map((participant: any) => <ParticipantVideo key={participant.session_id} participant={participant} active={participant.session_id === activeSpeaker?.session_id} />)}
        </section>
      ) : (
        <>
          <section className="fl-meet-main">
            {main && <ParticipantVideo participant={main} active={main.session_id === activeSpeaker?.session_id} />}
          </section>
          {thumbs.length > 0 && (
            <section className="fl-meet-thumbnails">
              {thumbs.map((participant: any) => <ParticipantVideo key={participant.session_id} participant={participant} compact active={participant.session_id === activeSpeaker?.session_id} />)}
            </section>
          )}
        </>
      )}
    </div>,
    mount,
  );
}
