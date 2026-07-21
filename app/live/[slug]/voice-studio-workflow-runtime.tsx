'use client';

import { useEffect } from 'react';

const MIN_TRACK_HEIGHT = 64;
const MAX_TRACK_HEIGHT = 220;
const DEFAULT_TRACK_HEIGHT = 92;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function studioRoot() {
  return document.querySelector<HTMLElement>('.vs-daw');
}

function controlButton(index: number) {
  return document.querySelector<HTMLButtonElement>(`.vs-main-controls button:nth-child(${index})`);
}

function flashShortcut(label: string) {
  document.querySelector('.vs-shortcut-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'vs-shortcut-toast';
  toast.textContent = label;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 900);
}

function installTrackResize(root: HTMLElement) {
  const heads = Array.from(root.querySelectorAll<HTMLElement>('.vs-track-heads article:not(.armed)'));
  const lanes = Array.from(root.querySelectorAll<HTMLElement>('.vs-timeline .vs-lane:not(.live)'));

  heads.forEach((head, index) => {
    if (head.dataset.workflowResize === '1') return;
    head.dataset.workflowResize = '1';
    const lane = lanes[index];
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'vs-track-resize-handle';
    handle.title = 'Arraste para aumentar ou reduzir a faixa';
    handle.setAttribute('aria-label', 'Redimensionar altura da faixa');
    head.appendChild(handle);

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startY = event.clientY;
      const startHeight = head.getBoundingClientRect().height || DEFAULT_TRACK_HEIGHT;
      handle.setPointerCapture(event.pointerId);

      const move = (moveEvent: PointerEvent) => {
        const height = Math.min(MAX_TRACK_HEIGHT, Math.max(MIN_TRACK_HEIGHT, startHeight + moveEvent.clientY - startY));
        head.style.height = `${height}px`;
        if (lane) lane.style.height = `${height}px`;
      };
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  });
}

function installZoom(root: HTMLElement) {
  const timeline = root.querySelector<HTMLElement>('.vs-timeline');
  if (!timeline || timeline.dataset.workflowZoom === '1') return;
  timeline.dataset.workflowZoom = '1';
  let zoom = Number(root.dataset.timelineZoom || '1');

  const applyZoom = () => {
    root.dataset.timelineZoom = String(zoom);
    root.style.setProperty('--vs-timeline-zoom', String(zoom));
  };
  applyZoom();

  timeline.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const previous = zoom;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + (event.deltaY < 0 ? .25 : -.25)));
    if (zoom === previous) return;
    applyZoom();
    flashShortcut(`Zoom da timeline: ${Math.round(zoom * 100)}%`);
  }, { passive: false });
}

function keepPlayheadVisible(root: HTMLElement) {
  const timeline = root.querySelector<HTMLElement>('.vs-timeline');
  const playhead = root.querySelector<HTMLElement>('.vs-playhead');
  if (!timeline || !playhead) return;
  const left = playhead.offsetLeft;
  const padding = 90;
  if (left > timeline.scrollLeft + timeline.clientWidth - padding) timeline.scrollLeft = left - timeline.clientWidth + padding;
  if (left < timeline.scrollLeft + 20) timeline.scrollLeft = Math.max(0, left - 20);
}

export default function VoiceStudioWorkflowRuntime() {
  useEffect(() => {
    let frame = 0;
    const enhance = () => {
      const root = studioRoot();
      if (!root) return;
      installTrackResize(root);
      installZoom(root);
      keepPlayheadVisible(root);
    };

    const loop = () => {
      enhance();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const keydown = (event: KeyboardEvent) => {
      const root = studioRoot();
      if (!root || isTypingTarget(event.target)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        const play = controlButton(1);
        if (play && !play.disabled) {
          play.click();
          flashShortcut('Espaço · Play / Pause');
        }
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        const record = controlButton(2);
        if (record && !record.disabled) {
          record.click();
          flashShortcut('R · Gravar / Parar');
        }
        return;
      }

      if (event.key === 'Escape') {
        document.querySelector<HTMLButtonElement>('.vs-track-menu button')?.blur();
        document.querySelector<HTMLElement>('.vs-track-menu')?.remove();
        flashShortcut('Esc · Fechar painel');
        return;
      }

      if (event.key === 'Home' || event.key === 'Enter') {
        const play = controlButton(1);
        const activeTime = root.querySelector('time');
        if (play && activeTime?.textContent !== '00:00.0' && !play.disabled) play.click();
        root.querySelector<HTMLElement>('.vs-timeline')?.scrollTo({ left: 0, behavior: 'smooth' });
        flashShortcut('Enter · Voltar ao início');
      }
    };

    window.addEventListener('keydown', keydown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keydown, true);
    };
  }, []);

  return null;
}
