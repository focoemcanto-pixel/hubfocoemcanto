'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type BoardSnapshot = {
  html: string;
  sequence: number;
};

type BoardMessage =
  | { type: 'foco-board-snapshot'; snapshot: BoardSnapshot }
  | { type: 'foco-board-request-state' };

type DailyCallLike = {
  on?: (event: string, listener: (event: { data?: BoardMessage }) => void) => void;
  sendAppMessage?: (message: BoardMessage, recipient: string) => void;
  __focoBoardBroadcastAttached?: boolean;
};

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: DailyCallLike };

function isHostPage() {
  return new URLSearchParams(window.location.search).get('host') === '1';
}

function boardIsVisibleToClass() {
  const room = document.querySelector('.fl-room');
  return Boolean(
    room?.classList.contains('foco-studio-broadcasting') &&
    document.querySelector('.fl-studio-scene.app-board'),
  );
}

export default function LiveBoardBroadcastRuntime() {
  const [viewerTarget, setViewerTarget] = useState<HTMLElement | null>(null);
  const [viewerHtml, setViewerHtml] = useState('');
  const latestSnapshotRef = useRef<BoardSnapshot | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const isHost = isHostPage();
    let observedCanvas: HTMLElement | null = null;
    let canvasObserver: MutationObserver | null = null;
    let publishTimer = 0;
    let discoveryTimer = 0;

    const call = () => (window as LiveWindow).__FOCO_LIVE_CALL__;

    const publishSnapshot = (force = false) => {
      if (!isHost || !boardIsVisibleToClass()) return;
      const canvas = document.querySelector<HTMLElement>('.fl-studio-scene.app-board .fl-board-canvas');
      if (!canvas) return;
      const html = canvas.innerHTML;
      if (!force && latestSnapshotRef.current?.html === html) return;
      const snapshot = { html, sequence: ++sequenceRef.current };
      latestSnapshotRef.current = snapshot;
      call()?.sendAppMessage?.({ type: 'foco-board-snapshot', snapshot }, '*');
    };

    const schedulePublish = () => {
      window.clearTimeout(publishTimer);
      publishTimer = window.setTimeout(() => publishSnapshot(), 70);
    };

    const attachCanvas = () => {
      const canvas = document.querySelector<HTMLElement>('.fl-studio-scene.app-board .fl-board-canvas');
      if (!isHost) {
        setViewerTarget(canvas);
        return;
      }
      if (canvas === observedCanvas) return;
      canvasObserver?.disconnect();
      observedCanvas = canvas;
      if (!canvas) return;
      canvasObserver = new MutationObserver(schedulePublish);
      canvasObserver.observe(canvas, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      schedulePublish();
    };

    const attachCall = () => {
      const current = call();
      if (!current || current.__focoBoardBroadcastAttached) return;
      current.__focoBoardBroadcastAttached = true;
      current.on?.('app-message', (event) => {
        const data = event?.data;
        if (data?.type === 'foco-board-request-state' && isHost) {
          publishSnapshot(true);
          return;
        }
        if (data?.type === 'foco-board-snapshot' && !isHost) {
          const incoming = data.snapshot;
          if (!incoming || incoming.sequence < (latestSnapshotRef.current?.sequence || 0)) return;
          latestSnapshotRef.current = incoming;
          setViewerHtml(incoming.html);
        }
      });
      current.on?.('joined-meeting', () => {
        if (!isHost) current.sendAppMessage?.({ type: 'foco-board-request-state' }, '*');
      });
      current.on?.('participant-joined', () => {
        if (isHost) publishSnapshot(true);
      });
      if (!isHost) current.sendAppMessage?.({ type: 'foco-board-request-state' }, '*');
    };

    const sync = () => {
      attachCall();
      attachCanvas();
    };

    discoveryTimer = window.setInterval(sync, 500);
    sync();

    return () => {
      window.clearInterval(discoveryTimer);
      window.clearTimeout(publishTimer);
      canvasObserver?.disconnect();
    };
  }, []);

  if (!viewerTarget || isHostPage() || !viewerHtml) return null;

  return createPortal(
    <div
      className="fl-board-broadcast-overlay"
      aria-label="Quadro do professor em tempo real"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 5 }}
      dangerouslySetInnerHTML={{ __html: viewerHtml }}
    />,
    viewerTarget,
  );
}
