'use client';

import { useEffect } from 'react';
import type { VoiceStudioProject } from './voice-studio-project-model';

const SNAPSHOT_EVENT = 'foco-voice-studio-snapshot';
const REQUEST_EVENT = 'foco-voice-studio-request-snapshot';
const LOAD_EVENT = 'foco-voice-studio-load-project';
const PROJECT_MESSAGE = 'foco-voice-studio-project';
const REQUEST_MESSAGE = 'foco-voice-studio-project-request';

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
`;

type ProjectMessage = { type: typeof PROJECT_MESSAGE; project: VoiceStudioProject };
type RequestMessage = { type: typeof REQUEST_MESSAGE };
type StudioMessage = ProjectMessage | RequestMessage;
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

    let lastProject: VoiceStudioProject | null = null;
    let lastSerialized = '';
    let timer = 0;
    let retryTimer = 0;

    const room = () => document.querySelector<HTMLElement>('.fl-room');
    const voiceSceneOpen = () => Boolean(document.querySelector('.fl-studio-scene.app-voice'));
    const broadcasting = () => Boolean(room()?.classList.contains('foco-studio-broadcasting'));
    const call = () => (window as StudioWindow).__FOCO_LIVE_CALL__;

    if (!isHost) room()?.classList.add('vs-broadcast-viewer');

    const requestProject = () => {
      if (isHost) return;
      call()?.sendAppMessage?.({ type: REQUEST_MESSAGE }, '*');
    };

    const startRequestRetries = () => {
      if (isHost) return;
      window.clearInterval(retryTimer);
      requestProject();
      let attempts = 0;
      retryTimer = window.setInterval(() => {
        requestProject();
        attempts += 1;
        if (attempts >= 8) window.clearInterval(retryTimer);
      }, 750);
    };

    const sendProject = (force = false) => {
      if (!isHost || !lastProject || !voiceSceneOpen() || !broadcasting()) return;
      const serialized = JSON.stringify(lastProject);
      if (!force && serialized === lastSerialized) return;
      lastSerialized = serialized;
      call()?.sendAppMessage?.({ type: PROJECT_MESSAGE, project: lastProject }, '*');
    };

    const attachCall = () => {
      const current = call();
      if (!current || current.__voiceViewerAttached) return;
      current.__voiceViewerAttached = true;
      current.on?.('app-message', event => {
        const data = event?.data;
        if (!data) return;
        if (data.type === PROJECT_MESSAGE && !isHost && data.project) {
          window.clearInterval(retryTimer);
          window.dispatchEvent(new CustomEvent(LOAD_EVENT, { detail: { project: data.project, blobs: {} } }));
        }
        if (data.type === REQUEST_MESSAGE && isHost) {
          window.dispatchEvent(new Event(REQUEST_EVENT));
          window.setTimeout(() => sendProject(true), 60);
        }
      });
      current.on?.('joined-meeting', () => {
        if (!isHost) startRequestRetries();
      });
      current.on?.('participant-joined', () => {
        if (isHost) {
          window.dispatchEvent(new Event(REQUEST_EVENT));
          window.setTimeout(() => sendProject(true), 80);
        }
      });
      current.on?.('network-connection', (event: { data?: StudioMessage } & { event?: string }) => {
        if (!isHost && event?.event === 'connected') startRequestRetries();
      });
      startRequestRetries();
    };

    const onSnapshot = (event: Event) => {
      if (!isHost) return;
      const project = (event as CustomEvent<{ project?: VoiceStudioProject }>).detail?.project;
      if (!project) return;
      lastProject = project;
      sendProject();
    };

    window.addEventListener(SNAPSHOT_EVENT, onSnapshot);
    timer = window.setInterval(() => {
      room()?.classList.toggle('vs-broadcast-viewer', !isHost);
      attachCall();
      if (isHost && voiceSceneOpen() && broadcasting()) window.dispatchEvent(new Event(REQUEST_EVENT));
    }, 500);

    attachCall();
    return () => {
      window.removeEventListener(SNAPSHOT_EVENT, onSnapshot);
      window.clearInterval(timer);
      window.clearInterval(retryTimer);
      room()?.classList.remove('vs-broadcast-viewer');
      style.remove();
    };
  }, []);

  return null;
}
