'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type BoardSnapshot = {
  html: string;
  sequence: number;
  width: number;
  height: number;
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

const VIEWER_CLASS = 'fl-board-has-remote-snapshot';
const STYLE_ID = 'fl-board-broadcast-style';

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

function snapshotHtml(canvas: HTMLElement) {
  const clone = canvas.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.fl-board-empty').forEach(element => element.remove());
  return clone.innerHTML;
}

export default function LiveBoardBroadcastRuntime() {
  const [viewerTarget, setViewerTarget] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [scale, setScale] = useState(1);
  const latestSnapshotRef = useRef<BoardSnapshot | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .fl-board-canvas.${VIEWER_CLASS}>:not(.fl-board-broadcast-overlay){visibility:hidden!important}
      .fl-board-canvas.${VIEWER_CLASS}{overflow:hidden!important;position:relative!important}
      .fl-board-broadcast-overlay{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:20;background:#fff}
      .fl-board-broadcast-stage{position:absolute;left:50%;top:50%;transform-origin:center center;overflow:hidden}
      .fl-board-broadcast-stage>.fl-board-grid{position:absolute!important;inset:0!important}
      .fl-board-broadcast-stage>svg{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;overflow:visible!important}
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

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
      const rect = canvas.getBoundingClientRect();
      const next: BoardSnapshot = {
        html: snapshotHtml(canvas),
        sequence: ++sequenceRef.current,
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      };
      if (!force && latestSnapshotRef.current?.html === next.html && latestSnapshotRef.current.width === next.width && latestSnapshotRef.current.height === next.height) return;
      latestSnapshotRef.current = next;
      call()?.sendAppMessage?.({ type: 'foco-board-snapshot', snapshot: next }, '*');
    };

    const schedulePublish = () => {
      window.clearTimeout(publishTimer);
      publishTimer = window.setTimeout(() => publishSnapshot(), 45);
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
      canvasObserver.observe(canvas, { childList: true, subtree: true, attributes: true, characterData: true });
      schedulePublish();
    };

    const attachCall = () => {
      const current = call();
      if (!current || current.__focoBoardBroadcastAttached) return;
      current.__focoBoardBroadcastAttached = true;
      current.on?.('app-message', event => {
        const data = event?.data;
        if (data?.type === 'foco-board-request-state' && isHost) {
          publishSnapshot(true);
          return;
        }
        if (data?.type === 'foco-board-snapshot' && !isHost) {
          const incoming = data.snapshot;
          if (!incoming || incoming.sequence < (latestSnapshotRef.current?.sequence || 0)) return;
          latestSnapshotRef.current = incoming;
          setSnapshot(incoming);
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

    discoveryTimer = window.setInterval(sync, 400);
    sync();
    return () => {
      window.clearInterval(discoveryTimer);
      window.clearTimeout(publishTimer);
      canvasObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!viewerTarget || !snapshot) return;
    viewerTarget.classList.add(VIEWER_CLASS);
    const resize = () => {
      const rect = viewerTarget.getBoundingClientRect();
      setScale(Math.min(rect.width / snapshot.width, rect.height / snapshot.height));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewerTarget);
    resize();
    return () => {
      observer.disconnect();
      viewerTarget.classList.remove(VIEWER_CLASS);
    };
  }, [viewerTarget, snapshot]);

  if (!viewerTarget || isHostPage() || !snapshot) return null;

  return createPortal(
    <div className="fl-board-broadcast-overlay" aria-label="Quadro do professor em tempo real">
      <div
        className="fl-board-broadcast-stage"
        style={{
          width: snapshot.width,
          height: snapshot.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
        dangerouslySetInnerHTML={{ __html: snapshot.html }}
      />
    </div>,
    viewerTarget,
  );
}
