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
    videoEl.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
    videoEl.play().catch(() => undefined);
  }, [videoEl, videoTrack]);

  useEffect(() => {
    if (!audioEl || participant?.local) return;
    audioEl.srcObject = audioTrack ? new MediaStream([audioTrack]) : null;
    audioEl.play().catch(() => undefined);
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
    const timer = window.setInterval(() => {
      const stage = document.querySelector<HTMLElement>('.fl-stage-wrap');
      const call = (window as any).__focoLiveCall;
      const host = Boolean(document.querySelector('.host-studio'));
      setIsHost(host);
      if (stage && stage !== mount) setMount(stage);
      if (!stage || !call) return;

      const sync = () => {
        try { setParticipants({ ...call.participants() }); } catch { /* conexão ainda iniciando */ }
      };

      if (!(call as any).__meetStageBound) {
        call.on('participant-joined', sync);
        call.on('participant-updated', sync);
        call.on('participant-left', sync);
        call.on('joined-meeting', sync);
        call.on('active-speaker-change', (event: any) => setActiveSpeakerId(event?.activeSpeaker?.peerId || event?.activeSpeaker?.session_id || null));
        (call as any).__meetStageBound = true;
      }
      sync();
      setEnabled(true);
    }, 500);

    return () => window.clearInterval(timer);
  }, [mount]);

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

  const main = layout === 'auto' && activeSpeaker && !activeSpeaker.local
    ? activeSpeaker
    : hostParticipant || local || remote[0];

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
