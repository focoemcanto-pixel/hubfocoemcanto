'use client';

import { useEffect } from 'react';
import type { VoiceStudioProject } from './voice-studio-project-model';

const SNAPSHOT_EVENT = 'foco-voice-studio-snapshot';
const LOAD_EVENT = 'foco-voice-studio-load-project';
const REQUEST_EVENT = 'foco-voice-studio-request-snapshot';
const STYLE_ID = 'voice-studio-monitor-transport-style';

type SnapshotDetail = { project: VoiceStudioProject; blobs?: Record<string, Blob> };

function clipCount(project: VoiceStudioProject) {
  return project.tracks.reduce((total, track) => total + track.clips.length, 0);
}

function projectEnd(project: VoiceStudioProject) {
  return project.tracks.reduce((end, track) => Math.max(end, ...track.clips.map(clip => clip.start + clip.duration), 0), 0);
}

function audioTrackArticles() {
  return Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)'))
    .filter(article => !article.querySelector(':scope > span svg'));
}

export default function VoiceStudioMonitorTransportRuntime() {
  useEffect(() => {
    let latest: SnapshotDetail | null = null;
    let previousClipCount = -1;
    let timer = 0;
    let resetting = false;

    const loadAt = (time: number, label: string) => {
      if (!latest || resetting) return;
      resetting = true;
      const project = structuredClone(latest.project);
      project.view = { ...project.view, playhead: Math.max(0, time) };
      window.dispatchEvent(new CustomEvent(LOAD_EVENT, {
        detail: { project, blobs: latest.blobs, historyLabel: label },
      }));
      window.setTimeout(() => { resetting = false; }, 80);
    };

    const goToStart = () => loadAt(0, 'Ir ao início');
    const goToEnd = () => latest && loadAt(projectEnd(latest.project), 'Ir ao fim');

    const ensureStyle = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .vs-transport-jump{width:34px!important;padding:0!important;font-size:13px!important;font-weight:900!important;letter-spacing:-2px}
        .vs-input-monitor{font-weight:900!important;color:#aeb4c2}
        .vs-input-monitor.active{background:#f59e0b!important;border-color:#fbbf24!important;color:#111827!important;box-shadow:0 0 0 2px rgba(245,158,11,.18)}
        .vs-input-monitor:not(.active):hover{color:#fde68a!important;border-color:#d97706!important}
      `;
      document.head.appendChild(style);
    };

    const ensureTransportButtons = () => {
      const controls = document.querySelector<HTMLElement>('.vs-daw-runtime .vs-main-controls');
      if (!controls) return;
      if (!controls.querySelector('.vs-go-start')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vs-transport-jump vs-go-start';
        button.title = 'Ir ao início (Home)';
        button.setAttribute('aria-label', 'Ir ao início');
        button.textContent = '|◀';
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          goToStart();
        });
        controls.prepend(button);
      }
      if (!controls.querySelector('.vs-go-end')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vs-transport-jump vs-go-end';
        button.title = 'Ir ao fim (End)';
        button.setAttribute('aria-label', 'Ir ao fim');
        button.textContent = '▶|';
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          goToEnd();
        });
        const time = controls.querySelector('time');
        controls.insertBefore(button, time || null);
      }
    };

    const monitorButton = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.vs-daw-runtime .vs-options button'))
      .find(button => button.textContent?.trim() === 'Monitor Input') || null;

    const ensureInputMonitoring = () => {
      const globalMonitor = monitorButton();
      audioTrackArticles().forEach(article => {
        const controls = article.querySelector<HTMLElement>(':scope > div');
        if (!controls) return;
        let button = controls.querySelector<HTMLButtonElement>('.vs-input-monitor');
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'vs-input-monitor';
          button.title = 'Input Monitoring — ouvir o microfone antes de gravar (use fones)';
          button.setAttribute('aria-label', 'Ativar monitoramento de entrada');
          button.textContent = 'I';
          button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const arm = article.querySelector<HTMLButtonElement>('button[title="Armar track"]');
            if (arm && !article.classList.contains('armed-track') && !article.classList.contains('vs-multi-armed')) arm.click();
            const monitor = monitorButton();
            if (monitor && !monitor.disabled) monitor.click();
          }, true);
          const mute = controls.querySelector('button:nth-of-type(2)');
          controls.insertBefore(button, mute || null);
        }
        const armed = article.classList.contains('armed-track') || article.classList.contains('vs-multi-armed');
        const active = Boolean(globalMonitor?.classList.contains('active') && armed);
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = Boolean(globalMonitor?.disabled && !active);
      });
    };

    const handleSnapshot = (event: Event) => {
      const detail = (event as CustomEvent<SnapshotDetail>).detail;
      if (!detail?.project) return;
      const currentCount = clipCount(detail.project);
      const deletedContent = previousClipCount >= 0 && currentCount < previousClipCount;
      latest = detail;
      previousClipCount = currentCount;
      if (deletedContent && detail.project.view.playhead > 0.001) window.setTimeout(goToStart, 0);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'Home') {
        event.preventDefault();
        goToStart();
      } else if (event.key === 'End') {
        event.preventDefault();
        goToEnd();
      }
    };

    window.addEventListener(SNAPSHOT_EVENT, handleSnapshot);
    window.addEventListener('keydown', handleKeyDown, true);
    ensureStyle();
    window.dispatchEvent(new Event(REQUEST_EVENT));
    timer = window.setInterval(() => {
      ensureTransportButtons();
      ensureInputMonitoring();
      if (!latest) window.dispatchEvent(new Event(REQUEST_EVENT));
    }, 120);

    return () => {
      window.removeEventListener(SNAPSHOT_EVENT, handleSnapshot);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.clearInterval(timer);
      document.querySelectorAll('.vs-go-start,.vs-go-end,.vs-input-monitor').forEach(node => node.remove());
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
