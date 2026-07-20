'use client';

import { useCallback, useLayoutEffect } from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import { projectDuration } from './voice-studio-project-model';
import { useVoiceStudio } from './voice-studio-provider';
import { useVoiceStudioSessionTransport } from './use-voice-studio-transport';

const TRANSPORT_CSS = `
.vs-session-transport{position:sticky;bottom:0;z-index:30;display:flex;align-items:center;justify-content:center;gap:8px;min-height:58px;padding:9px 16px;border-top:1px solid #303541;background:rgba(18,21,28,.96);backdrop-filter:blur(14px)}
.vs-session-transport button{width:38px;height:38px;border:1px solid #3a404d;border-radius:9px;background:#20242d;color:#d6d9e0;display:grid;place-items:center;cursor:pointer}
.vs-session-transport button:hover:not(:disabled){border-color:#8b5cf6;color:#fff;background:#29233b}
.vs-session-transport button:disabled{opacity:.35;cursor:not-allowed}
.vs-session-transport button.primary{width:44px;height:44px;border-radius:50%;background:#7c3aed;border-color:#8b5cf6;color:#fff}
.vs-session-transport button.stop{color:#fca5a5}
.vs-session-transport svg{width:17px;height:17px}
.vs-session-transport time{min-width:88px;margin-left:8px;color:#e5e7eb;font-variant-numeric:tabular-nums;font-size:13px;font-weight:800}
.vs-session-transport .state{min-width:82px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.vs-main-controls{display:none!important}
`;

function timeLabel(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${tenths}`;
}

export function useSessionTransportRequest() {
  const { session } = useVoiceStudio();
  return useCallback(() => {
    const duration = Math.max(0, projectDuration(session.project));
    const playhead = session.transport.getSnapshot().playhead;
    return {
      offset: playhead >= duration ? 0 : playhead,
      end: duration,
      mode: session.project.loop.enabled ? 'loop' as const : 'project' as const,
      loop: session.project.loop.enabled,
    };
  }, [session]);
}

/** Registered before the legacy controller passive effect, so Space has one owner. */
export function VoiceStudioTransportKeyboardOwner() {
  const { commands } = useVoiceStudioSessionTransport();
  const createRequest = useSessionTransportRequest();

  useLayoutEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.stopImmediatePropagation();
      void commands.handleKeyDown(event, createRequest());
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [commands, createRequest]);

  return null;
}

export function VoiceStudioSessionTransport() {
  const { session } = useVoiceStudio();
  const { snapshot, viewModel, commands } = useVoiceStudioSessionTransport();
  const createRequest = useSessionTransportRequest();
  const duration = projectDuration(session.project);
  const hasContent = duration > 0;

  const play = () => { if (hasContent) void commands.play(createRequest()); };

  return (
    <>
      <style>{TRANSPORT_CSS}</style>
      <footer className="vs-session-transport" aria-label="Transport do Voice Studio">
        <button title="Voltar ao início" disabled={!viewModel.canReturnToStart} onClick={() => commands.returnToStart()}><RotateCcw /></button>
        <button className="primary" title="Reproduzir" disabled={!viewModel.canPlay || !hasContent} onClick={play}><Play fill="currentColor" /></button>
        <button title="Pausar" disabled={!viewModel.canPause} onClick={() => commands.pause()}><Pause fill="currentColor" /></button>
        <button className="stop" title="Parar" disabled={!viewModel.canStop} onClick={() => commands.stop()}><Square fill="currentColor" /></button>
        <time>{timeLabel(snapshot.playhead)}</time>
        <span className="state">{snapshot.state.replace('_', ' ')}</span>
      </footer>
    </>
  );
}
