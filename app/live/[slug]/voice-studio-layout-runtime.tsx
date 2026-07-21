'use client';

import { useEffect } from 'react';

const PANEL_WIDTH_KEY = 'voice-studio-panel-width';
const TRACK_HEIGHTS_KEY = 'voice-studio-track-heights';
const TOP_META_KEY = 'voice-studio-top-meta-height';
const DEFAULT_PANEL_WIDTH = 244;
const DEFAULT_TRACK_HEIGHT = 92;
const DEFAULT_TOP_META_HEIGHT = 0;
const MIN_PANEL_WIDTH = 176;
const MAX_PANEL_WIDTH = 520;
const MIN_TRACK_HEIGHT = 68;
const MAX_TRACK_HEIGHT = 220;
const MAX_TOP_META_HEIGHT = 86;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readTrackHeights() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRACK_HEIGHTS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function writeTrackHeights(value: Record<string, number>) {
  localStorage.setItem(TRACK_HEIGHTS_KEY, JSON.stringify(value));
}

function trackKey(article: HTMLElement, index: number) {
  const input = article.querySelector<HTMLInputElement>('input');
  return input?.value?.trim() || `track-${index}`;
}

function applyPanelDensity(runtime: HTMLElement, width: number) {
  runtime.classList.toggle('vs-panel-compact', width < 285);
  runtime.classList.toggle('vs-panel-narrow', width < 225);
  runtime.classList.toggle('vs-panel-ultra', width < 195);
}

function applyTopDensity(shell: HTMLElement, height: number) {
  shell.style.setProperty('--vs-top-meta-height', `${height}px`);
  shell.classList.toggle('vs-top-collapsed', height < 18);
  shell.classList.toggle('vs-top-compact', height >= 18 && height < 58);
}

export default function VoiceStudioLayoutRuntime() {
  useEffect(() => {
    let cleanupCurrent: (() => void) | null = null;
    let installFrame = 0;

    const install = () => {
      cleanupCurrent?.();
      cleanupCurrent = null;

      const runtime = document.querySelector<HTMLElement>('.vs-daw-runtime');
      const shell = runtime?.closest<HTMLElement>('.vs-manager-shell');
      const session = shell?.querySelector<HTMLElement>('.vs-session-view');
      const meta = session?.querySelector<HTMLElement>('.vs-session-meta');
      const editorSlot = session?.querySelector<HTMLElement>('.vs-editor-slot');
      const editor = runtime?.querySelector<HTMLElement>('.vs-editor');
      const heads = editor?.querySelector<HTMLElement>('.vs-track-heads');
      const timeline = editor?.querySelector<HTMLElement>('.vs-timeline');
      if (!runtime || !shell || !session || !meta || !editorSlot || !editor || !heads || !timeline) return;

      const disposers: Array<() => void> = [];
      const panelWidth = clamp(Number(localStorage.getItem(PANEL_WIDTH_KEY)) || DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
      runtime.style.setProperty('--vs-track-panel-width', `${panelWidth}px`);
      applyPanelDensity(runtime, panelWidth);

      const storedTopHeight = clamp(Number(localStorage.getItem(TOP_META_KEY)) || DEFAULT_TOP_META_HEIGHT, 0, MAX_TOP_META_HEIGHT);
      applyTopDensity(shell, storedTopHeight);

      let vertical = editor.querySelector<HTMLElement>(':scope > .vs-layout-splitter');
      if (!vertical) {
        vertical = document.createElement('div');
        vertical.className = 'vs-layout-splitter';
        vertical.title = 'Arraste para redimensionar o painel. Duplo clique para restaurar.';
        editor.appendChild(vertical);
      }

      const resizePanel = (event: PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = heads.getBoundingClientRect().width;
        vertical?.setPointerCapture(event.pointerId);
        document.body.classList.add('vs-layout-resizing');

        const move = (moveEvent: PointerEvent) => {
          const width = clamp(startWidth + moveEvent.clientX - startX, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
          runtime.style.setProperty('--vs-track-panel-width', `${width}px`);
          applyPanelDensity(runtime, width);
        };
        const end = () => {
          const width = clamp(heads.getBoundingClientRect().width, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
          localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(width)));
          applyPanelDensity(runtime, width);
          document.body.classList.remove('vs-layout-resizing');
          window.removeEventListener('pointermove', move, true);
          window.removeEventListener('pointerup', end, true);
          window.removeEventListener('pointercancel', end, true);
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', end, true);
      };
      const resetPanel = () => {
        runtime.style.setProperty('--vs-track-panel-width', `${DEFAULT_PANEL_WIDTH}px`);
        applyPanelDensity(runtime, DEFAULT_PANEL_WIDTH);
        localStorage.removeItem(PANEL_WIDTH_KEY);
      };
      vertical.addEventListener('pointerdown', resizePanel);
      vertical.addEventListener('dblclick', resetPanel);
      disposers.push(() => vertical?.removeEventListener('pointerdown', resizePanel));
      disposers.push(() => vertical?.removeEventListener('dblclick', resetPanel));

      let horizontal = session.querySelector<HTMLElement>(':scope > .vs-top-layout-splitter');
      if (!horizontal) {
        horizontal = document.createElement('div');
        horizontal.className = 'vs-top-layout-splitter';
        horizontal.title = 'Arraste para mostrar ou ocultar os detalhes do projeto. Duplo clique alterna.';
        session.insertBefore(horizontal, editorSlot);
      }

      const resizeTop = (event: PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = parseFloat(getComputedStyle(shell).getPropertyValue('--vs-top-meta-height')) || 0;
        horizontal?.setPointerCapture(event.pointerId);
        document.body.classList.add('vs-layout-resizing');

        const move = (moveEvent: PointerEvent) => {
          applyTopDensity(shell, clamp(startHeight + moveEvent.clientY - startY, 0, MAX_TOP_META_HEIGHT));
        };
        const end = () => {
          const height = clamp(parseFloat(getComputedStyle(shell).getPropertyValue('--vs-top-meta-height')) || 0, 0, MAX_TOP_META_HEIGHT);
          localStorage.setItem(TOP_META_KEY, String(Math.round(height)));
          document.body.classList.remove('vs-layout-resizing');
          window.removeEventListener('pointermove', move, true);
          window.removeEventListener('pointerup', end, true);
          window.removeEventListener('pointercancel', end, true);
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', end, true);
      };
      const toggleTop = () => {
        const current = parseFloat(getComputedStyle(shell).getPropertyValue('--vs-top-meta-height')) || 0;
        const next = current < 18 ? MAX_TOP_META_HEIGHT : 0;
        applyTopDensity(shell, next);
        localStorage.setItem(TOP_META_KEY, String(next));
      };
      horizontal.addEventListener('pointerdown', resizeTop);
      horizontal.addEventListener('dblclick', toggleTop);
      disposers.push(() => horizontal?.removeEventListener('pointerdown', resizeTop));
      disposers.push(() => horizontal?.removeEventListener('dblclick', toggleTop));

      const storedHeights = readTrackHeights();
      const articles = Array.from(heads.querySelectorAll<HTMLElement>(':scope > article')).filter(article => !article.classList.contains('armed'));
      const lanes = Array.from(timeline.querySelectorAll<HTMLElement>('.vs-pro-canvas-content > .vs-lane:not(.live)'));

      articles.forEach((article, index) => {
        const key = trackKey(article, index);
        const lane = lanes[index];
        const savedHeight = clamp(Number(storedHeights[key]) || DEFAULT_TRACK_HEIGHT, MIN_TRACK_HEIGHT, MAX_TRACK_HEIGHT);
        article.style.setProperty('height', `${savedHeight}px`, 'important');
        lane?.style.setProperty('height', `${savedHeight}px`, 'important');

        let handle = article.querySelector<HTMLElement>(':scope > .vs-track-height-splitter');
        if (!handle) {
          handle = document.createElement('div');
          handle.className = 'vs-track-height-splitter';
          handle.title = 'Arraste para alterar a altura desta faixa. Duplo clique para restaurar.';
          article.appendChild(handle);
        }

        const resizeTrack = (event: PointerEvent) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const startY = event.clientY;
          const startHeight = article.getBoundingClientRect().height;
          handle?.setPointerCapture(event.pointerId);
          document.body.classList.add('vs-layout-resizing');

          const move = (moveEvent: PointerEvent) => {
            const height = clamp(startHeight + moveEvent.clientY - startY, MIN_TRACK_HEIGHT, MAX_TRACK_HEIGHT);
            article.style.setProperty('height', `${height}px`, 'important');
            lane?.style.setProperty('height', `${height}px`, 'important');
          };
          const end = () => {
            const height = clamp(article.getBoundingClientRect().height, MIN_TRACK_HEIGHT, MAX_TRACK_HEIGHT);
            const next = readTrackHeights();
            next[key] = Math.round(height);
            writeTrackHeights(next);
            document.body.classList.remove('vs-layout-resizing');
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', end, true);
            window.removeEventListener('pointercancel', end, true);
          };
          window.addEventListener('pointermove', move, true);
          window.addEventListener('pointerup', end, true);
          window.addEventListener('pointercancel', end, true);
        };
        const resetTrack = (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          article.style.setProperty('height', `${DEFAULT_TRACK_HEIGHT}px`, 'important');
          lane?.style.setProperty('height', `${DEFAULT_TRACK_HEIGHT}px`, 'important');
          const next = readTrackHeights();
          delete next[key];
          writeTrackHeights(next);
        };
        handle.addEventListener('pointerdown', resizeTrack);
        handle.addEventListener('dblclick', resetTrack);
        disposers.push(() => handle?.removeEventListener('pointerdown', resizeTrack));
        disposers.push(() => handle?.removeEventListener('dblclick', resetTrack));
      });

      const widthObserver = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width || heads.getBoundingClientRect().width;
        applyPanelDensity(runtime, width);
      });
      widthObserver.observe(heads);
      disposers.push(() => widthObserver.disconnect());

      cleanupCurrent = () => {
        disposers.forEach(dispose => dispose());
        document.body.classList.remove('vs-layout-resizing');
      };
    };

    const observer = new MutationObserver(() => {
      cancelAnimationFrame(installFrame);
      installFrame = requestAnimationFrame(install);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    install();

    return () => {
      cancelAnimationFrame(installFrame);
      observer.disconnect();
      cleanupCurrent?.();
    };
  }, []);

  return null;
}
