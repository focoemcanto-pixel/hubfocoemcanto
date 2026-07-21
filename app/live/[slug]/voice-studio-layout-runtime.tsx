'use client';

import { useEffect } from 'react';

const PANEL_WIDTH_KEY = 'voice-studio-panel-width';
const TRACK_HEIGHTS_KEY = 'voice-studio-track-heights';
const DEFAULT_PANEL_WIDTH = 244;
const DEFAULT_TRACK_HEIGHT = 92;
const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 520;
const MIN_TRACK_HEIGHT = 68;
const MAX_TRACK_HEIGHT = 220;

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

export default function VoiceStudioLayoutRuntime() {
  useEffect(() => {
    let cleanupCurrent: (() => void) | null = null;

    const install = () => {
      cleanupCurrent?.();
      cleanupCurrent = null;

      const runtime = document.querySelector<HTMLElement>('.vs-daw-runtime');
      const editor = runtime?.querySelector<HTMLElement>('.vs-editor');
      const heads = editor?.querySelector<HTMLElement>('.vs-track-heads');
      const timeline = editor?.querySelector<HTMLElement>('.vs-timeline');
      if (!runtime || !editor || !heads || !timeline) return;

      const disposers: Array<() => void> = [];
      const panelWidth = clamp(Number(localStorage.getItem(PANEL_WIDTH_KEY)) || DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
      runtime.style.setProperty('--vs-track-panel-width', `${panelWidth}px`);

      let vertical = editor.querySelector<HTMLElement>(':scope > .vs-layout-splitter');
      if (!vertical) {
        vertical = document.createElement('div');
        vertical.className = 'vs-layout-splitter';
        vertical.title = 'Arraste para redimensionar o painel das faixas. Duplo clique para restaurar.';
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
        };
        const end = () => {
          const width = clamp(heads.getBoundingClientRect().width, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
          localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(width)));
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
        localStorage.removeItem(PANEL_WIDTH_KEY);
      };
      vertical.addEventListener('pointerdown', resizePanel);
      vertical.addEventListener('dblclick', resetPanel);
      disposers.push(() => vertical?.removeEventListener('pointerdown', resizePanel));
      disposers.push(() => vertical?.removeEventListener('dblclick', resetPanel));

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

      cleanupCurrent = () => {
        disposers.forEach(dispose => dispose());
        document.body.classList.remove('vs-layout-resizing');
      };
    };

    const observer = new MutationObserver(() => window.requestAnimationFrame(install));
    observer.observe(document.body, { childList: true, subtree: true });
    install();

    return () => {
      observer.disconnect();
      cleanupCurrent?.();
    };
  }, []);

  return null;
}
