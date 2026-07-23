'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type BoardSnapshot = { html: string; sequence: number; width: number; height: number };
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

function isHostPage() { return new URLSearchParams(window.location.search).get('host') === '1'; }
function boardIsVisibleToClass() {
  const room = document.querySelector('.fl-room');
  return Boolean(room?.classList.contains('foco-studio-broadcasting') && document.querySelector('.fl-studio-scene.app-board'));
}
function snapshotHtml(canvas: HTMLElement) {
  const clone = canvas.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.fl-board-empty').forEach(element => element.remove());
  clone.querySelectorAll('[contenteditable="true"]').forEach(element => element.setAttribute('contenteditable', 'false'));
  return clone.innerHTML;
}

export default function LiveBoardBroadcastRuntime() {
  const [viewerTarget, setViewerTarget] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const latestSnapshotRef = useRef<BoardSnapshot | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .fl-board-canvas.${VIEWER_CLASS}>:not(.fl-board-broadcast-overlay){visibility:hidden!important}
      .fl-board-canvas.${VIEWER_CLASS}{overflow:hidden!important;position:relative!important}
      .fl-board-broadcast-overlay{position:absolute;inset:0;overflow:hidden;pointer-events:auto;z-index:20;background:#fff}
      .fl-board-broadcast-toolbar{position:absolute;z-index:30;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:6px;border:1px solid rgba(0,0,0,.12);border-radius:12px;background:rgba(20,22,29,.92);box-shadow:0 8px 24px rgba(0,0,0,.24)}
      .fl-board-broadcast-toolbar button{height:32px;min-width:34px;padding:0 10px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#262b36;color:#fff;font-size:11px;font-weight:800}
      .fl-board-broadcast-toolbar button.active{background:#6d36e8;border-color:#9c78ff}
      .fl-board-broadcast-stage{position:absolute;left:50%;top:50%;transform-origin:center center;overflow:hidden;pointer-events:none}
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
        html: snapshotHtml(canvas), sequence: ++sequenceRef.current,
        width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)),
      };
      if (!force && latestSnapshotRef.current?.html === next.html && latestSnapshotRef.current.width === next.width && latestSnapshotRef.current.height === next.height) return;
      latestSnapshotRef.current = next;
      call()?.sendAppMessage?.({ type: 'foco-board-snapshot', snapshot: next }, '*');
    };
    const schedulePublish = () => { window.clearTimeout(publishTimer); publishTimer = window.setTimeout(() => publishSnapshot(), 45); };
    const attachCanvas = () => {
      const canvas = document.querySelector<HTMLElement>('.fl-studio-scene.app-board .fl-board-canvas');
      if (!isHost) { setViewerTarget(canvas); return; }
      if (canvas === observedCanvas) return;
      canvasObserver?.disconnect(); observedCanvas = canvas;
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
        if (data?.type === 'foco-board-request-state' && isHost) { publishSnapshot(true); return; }
        if (data?.type === 'foco-board-snapshot' && !isHost) {
          const incoming = data.snapshot;
          if (!incoming || incoming.sequence < (latestSnapshotRef.current?.sequence || 0)) return;
          latestSnapshotRef.current = incoming;
          setSnapshot(incoming);
        }
      });
      current.on?.('joined-meeting', () => { if (!isHost) current.sendAppMessage?.({ type: 'foco-board-request-state' }, '*'); });
      current.on?.('participant-joined', () => { if (isHost) publishSnapshot(true); });
      if (!isHost) current.sendAppMessage?.({ type: 'foco-board-request-state' }, '*');
    };
    const sync = () => { attachCall(); attachCanvas(); };
    discoveryTimer = window.setInterval(sync, 400); sync();
    return () => { window.clearInterval(discoveryTimer); window.clearTimeout(publishTimer); canvasObserver?.disconnect(); };
  }, []);

  useEffect(() => {
    if (!viewerTarget || !snapshot) return;
    viewerTarget.classList.add(VIEWER_CLASS);
    const resize = () => {
      const rect = viewerTarget.getBoundingClientRect();
      const rotated = orientation === 'horizontal';
      const width = rotated ? snapshot.height : snapshot.width;
      const height = rotated ? snapshot.width : snapshot.height;
      setFitScale(Math.min(rect.width / width, rect.height / height));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewerTarget); resize();
    return () => { observer.disconnect(); viewerTarget.classList.remove(VIEWER_CLASS); };
  }, [viewerTarget, snapshot, orientation]);

  if (!viewerTarget || isHostPage() || !snapshot) return null;
  const rotation = orientation === 'horizontal' ? ' rotate(90deg)' : '';
  return createPortal(
    <div className="fl-board-broadcast-overlay" aria-label="Quadro do professor em tempo real">
      <div className="fl-board-broadcast-toolbar">
        <button className={orientation === 'vertical' ? 'active' : ''} onClick={() => { setOrientation('vertical'); setZoom(1); }}>Celular</button>
        <button className={orientation === 'horizontal' ? 'active' : ''} onClick={() => { setOrientation('horizontal'); setZoom(1); }}>Horizontal</button>
        <button onClick={() => setZoom(value => Math.max(.5, Number((value - .15).toFixed(2))))}>−</button>
        <button onClick={() => setZoom(value => Math.min(3, Number((value + .15).toFixed(2))))}>+</button>
      </div>
      <div className="fl-board-broadcast-stage" style={{
        width: snapshot.width, height: snapshot.height,
        transform: `translate(-50%, -50%)${rotation} scale(${fitScale * zoom})`,
      }} dangerouslySetInnerHTML={{ __html: snapshot.html }} />
    </div>, viewerTarget,
  );
}
