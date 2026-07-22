'use client';

import { useEffect } from 'react';
import type { VoiceStudioProject } from './voice-studio-project-model';

const SNAPSHOT_EVENT = 'foco-voice-studio-snapshot';
const REQUEST_EVENT = 'foco-voice-studio-request-snapshot';
const LOAD_EVENT = 'foco-voice-studio-load-project';
const MESSAGE_TYPE = 'foco-voice-studio-project';

const CSS = `
.vs-broadcast-viewer .vs-manager-topbar,
.vs-broadcast-viewer .vs-session-meta,
.vs-broadcast-viewer .vs-transport,
.vs-broadcast-viewer .vs-options,
.vs-broadcast-viewer .vs-add-wrap,
.vs-broadcast-viewer .vs-track-heads article > div,
.vs-broadcast-viewer .vs-track-heads article > label,
.vs-broadcast-viewer .vs-track-input-strip,
.vs-broadcast-viewer .vs-selection-info,
.vs-broadcast-viewer .vs-fit-tools{display:none!important}
.vs-broadcast-viewer .vs-manager-shell,
.vs-broadcast-viewer .vs-session-view,
.vs-broadcast-viewer .vs-editor-slot,
.vs-broadcast-viewer .vs-daw-runtime,
.vs-broadcast-viewer .vs-daw{height:100%!important;min-height:0!important}
.vs-broadcast-viewer .vs-session-view{padding:0!important}
.vs-broadcast-viewer .vs-editor-slot{border:0!important;border-radius:0!important;overflow:hidden!important}
.vs-broadcast-viewer .vs-editor{height:100%!important;min-height:100%!important;pointer-events:none!important}
.vs-broadcast-viewer .vs-track-heads article input{pointer-events:none!important;border:0!important;background:transparent!important;color:#fff!important}
.vs-broadcast-viewer .vs-manager-loading{display:none!important}
`;

type StudioMessage = { type: typeof MESSAGE_TYPE; project: VoiceStudioProject };
type CallLike = {
  __voiceViewerAttached?: boolean;
  on?: (event: string, listener: (event: { data?: StudioMessage }) => void) => void;
  sendAppMessage?: (message: StudioMessage, recipient: string) => void;
};
type StudioWindow = Window & { __FOCO_LIVE_CALL__?: CallLike };

export default function VoiceStudioBroadcastViewerRuntime() {
  useEffect(() => {
    const isHost = new URLSearchParams(window.location.search).get('host') === '1';
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    let lastSerialized = '';
    let timer = 0;

    const room = () => document.querySelector<HTMLElement>('.fl-room');
    const voiceSceneOpen = () => Boolean(document.querySelector('.fl-studio-scene.app-voice'));
    const broadcasting = () => Boolean(room()?.classList.contains('foco-studio-broadcasting'));

    if (!isHost) room()?.classList.add('vs-broadcast-viewer');

    const attachGuest = () => {
      if (isHost) return;
      room()?.classList.add('vs-broadcast-viewer');
      const call = (window as StudioWindow).__FOCO_LIVE_CALL__;
      if (!call || call.__voiceViewerAttached) return;
      call.__voiceViewerAttached = true;
      call.on?.('app-message', event => {
        const data = event?.data;
        if (data?.type !== MESSAGE_TYPE || !data.project) return;
        window.dispatchEvent(new CustomEvent(LOAD_EVENT, { detail: { project: data.project, blobs: {} } }));
      });
    };

    const onSnapshot = (event: Event) => {
      if (!isHost || !voiceSceneOpen() || !broadcasting()) return;
      const project = (event as CustomEvent<{ project?: VoiceStudioProject }>).detail?.project;
      if (!project) return;
      const serialized = JSON.stringify(project);
      if (serialized === lastSerialized) return;
      lastSerialized = serialized;
      (window as StudioWindow).__FOCO_LIVE_CALL__?.sendAppMessage?.({ type: MESSAGE_TYPE, project }, '*');
    };

    window.addEventListener(SNAPSHOT_EVENT, onSnapshot);
    timer = window.setInterval(() => {
      attachGuest();
      if (isHost && voiceSceneOpen() && broadcasting()) window.dispatchEvent(new Event(REQUEST_EVENT));
    }, 700);

    attachGuest();
    return () => {
      window.removeEventListener(SNAPSHOT_EVENT, onSnapshot);
      window.clearInterval(timer);
      room()?.classList.remove('vs-broadcast-viewer');
      style.remove();
    };
  }, []);

  return null;
}
