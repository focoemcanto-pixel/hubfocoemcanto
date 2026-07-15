'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Grid2X2, LayoutPanelTop, Sparkles } from 'lucide-react';

type LayoutMode = 'class' | 'grid' | 'auto';
type Participant = any;

declare global {
  interface Window {
    __focoLiveCall?: any;
  }
}

function participantSignature(items: Record<string, Participant>) {
  return Object.values(items)
    .map((participant: any) => {
      const videoTrack = participant?.tracks?.video?.persistentTrack || participant?.videoTrack;
      const audioTrack = participant?.tracks?.audio?.persistentTrack || participant?.audioTrack;
      return [
        participant?.session_id || participant?.user_id || '',
        participant?.local ? '1' : '0',
        participant?.owner ? '1' : '0',
        participant?.audio === false ? '0' : '1',
        participant?.video === false ? '0' : '1',
        audioTrack?.id || '',
        videoTrack?.id || '',
        participant?.user_name || '',
      ].join(':');
    })
    .sort()
    .join('|');
}

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
    if (videoEl.srcObject !== stream) videoEl.srcObject = stream;
    if (stream) void videoEl.play().catch(() => undefined);
    return () => {
      if (videoEl.srcObject === stream) videoEl.srcObject = null;
    };
  }, [videoEl, videoTrack]);

  useEffect(() => {
    if (!audioEl || participant?.local) return;
    const stream = audioTrack ? new MediaStream([audioTrack]) : null;
    if (audioEl.srcObject !== stream) audioEl.srcObject = stream;
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
  const signatureRef = useRef('');

  useEffect(() => {
    let call: any = null;
    let discoveryTimer = 0;
    let frame = 0;
    let disposed = false;

    const syncParticipants = () => {
      if (!call || disposed) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!call || disposed) return;
        try {
          const next = { ...call.participants() };
          const signature = participantSignature(next);
          if (signature === signatureRef.current) return;
          signatureRef.current = signature;
          setParticipants(next);
        } catch {
          // A chamada ainda pode estar concluindo a entrada.
        }
      });
    };

    const onActiveSpeaker = (event: any) => {
      setActiveSpeakerId(event?.activeSpeaker?.peerId || event?.activeSpeaker?.session_id || null);
    };

    const bind = () => {
      const stage = document.querySelector<HTMLElement>('.fl-stage-wrap');
      const nextCall = window.__focoLiveCall;
      setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
      if (stage) setMount((current) => current === stage ? current : stage);
      if (!stage || !nextCall) return false;

      call = nextCall;
      call.on('participant-joined', syncParticipants);
      call.on('participant-updated', syncParticipants);
      call.on('participant-left', syncParticipants);
      call.on('joined-meeting', syncParticipants);
      call.on('active-speaker-change', onActiveSpeaker);
      syncParticipants();
      setEnabled(true);
      return true;
    };

    if (!bind()) {
      discoveryTimer = window.setInterval(() => {
        if (bind()) window.clearInterval(discoveryTimer);
      }, 250);
    }

    return () => {
      disposed = true;
      window.clearInterval(discoveryTimer);
      window.cancelAnimationFrame(frame);
      if (call) {
        call.off?.('participant-joined', syncParticipants);
        call.off?.('participant-updated', syncParticipants);
        call.off?.('participant-left', syncParticipants);
        call.off?.('joined-meeting', syncParticipants);
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
