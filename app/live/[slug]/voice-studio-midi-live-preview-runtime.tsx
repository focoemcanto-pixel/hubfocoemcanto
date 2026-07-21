'use client';

import { useEffect } from 'react';

type LiveNote = {
  note: number;
  velocity: number;
  start: number;
  duration?: number;
};

const STYLE_ID = 'voice-studio-midi-live-preview-style';

function isRecording() {
  return Boolean(document.querySelector('.vs-daw-runtime .vs-main-controls button.recording'));
}

function midiTrackArticles() {
  return Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)'))
    .filter(article => Boolean(article.querySelector(':scope > span svg')));
}

function selectedInputId() {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('.vs-daw-runtime .vs-options label'));
  const select = labels.find(label => label.textContent?.trim().startsWith('Teclado'))?.querySelector<HTMLSelectElement>('select');
  return select?.value || '';
}

function activeMidiArticle() {
  return midiTrackArticles().find(article => {
    const arm = article.querySelector<HTMLButtonElement>('button[title="Armar track"]');
    return article.classList.contains('vs-multi-armed') || article.classList.contains('armed-track') || arm?.classList.contains('recording');
  }) || null;
}

function laneForArticle(article: HTMLElement | null) {
  if (!article) return null;
  const articles = Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)'));
  const lanes = Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-pro-canvas-content > .vs-lane:not(.live)'));
  const index = articles.indexOf(article);
  return index >= 0 ? lanes[index] || null : null;
}

function playheadX() {
  const playhead = document.querySelector<HTMLElement>('.vs-daw-runtime .vs-playhead');
  if (!playhead) return 0;
  const transform = getComputedStyle(playhead).transform;
  if (!transform || transform === 'none') return 0;
  const match = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),/);
  return match ? Number(match[1]) || 0 : 0;
}

export default function VoiceStudioMidiLivePreviewRuntime() {
  useEffect(() => {
    let access: MIDIAccess | null = null;
    let frame = 0;
    let wasRecording = false;
    let startedAt = 0;
    let startX = 0;
    let overlay: HTMLElement | null = null;
    let attachedInputs = new Set<string>();

    const completed: LiveNote[] = [];
    const active = new Map<number, LiveNote>();

    const installStyle = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .vs-midi-live-preview{position:absolute;top:8px;bottom:8px;z-index:5;border:1px solid rgba(167,139,250,.82);border-radius:7px;background:linear-gradient(180deg,rgba(91,33,182,.42),rgba(76,29,149,.28));overflow:hidden;pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,.05) inset}
        .vs-midi-live-preview::before{content:'GRAVANDO MIDI';position:absolute;top:5px;left:7px;color:#ddd6fe;font-size:9px;font-weight:900;letter-spacing:.08em;opacity:.9;z-index:2}
        .vs-midi-live-preview i{position:absolute;height:5px;min-width:3px;border-radius:999px;background:#a78bfa;box-shadow:0 0 8px rgba(139,92,246,.5);transform:translateY(-50%)}
        .vs-midi-live-preview i.active{background:#f5f3ff;box-shadow:0 0 10px rgba(255,255,255,.72)}
        .vs-midi-live-preview.empty::after{content:'Toque o teclado para registrar as notas';position:absolute;inset:0;display:grid;place-items:center;color:#c4b5fd;font-size:10px;font-weight:700;opacity:.72}
      `;
      document.head.appendChild(style);
    };

    const clearPreview = () => {
      overlay?.remove();
      overlay = null;
      completed.length = 0;
      active.clear();
    };

    const ensureOverlay = () => {
      const lane = laneForArticle(activeMidiArticle());
      if (!lane) return null;
      if (overlay?.isConnected && overlay.parentElement === lane) return overlay;
      overlay?.remove();
      overlay = document.createElement('div');
      overlay.className = 'vs-midi-live-preview empty';
      lane.appendChild(overlay);
      return overlay;
    };

    const render = () => {
      const recording = isRecording();
      if (recording && !wasRecording) {
        startedAt = performance.now();
        startX = playheadX();
        completed.length = 0;
        active.clear();
        ensureOverlay();
      }

      if (!recording && wasRecording) {
        window.setTimeout(clearPreview, 450);
      }

      wasRecording = recording;

      if (recording) {
        const target = ensureOverlay();
        if (target) {
          const elapsed = Math.max(0.08, (performance.now() - startedAt) / 1000);
          const currentX = playheadX();
          const width = Math.max(18, currentX - startX);
          target.style.left = `${Math.max(0, startX)}px`;
          target.style.width = `${width}px`;
          const notes = [...completed, ...Array.from(active.values()).map(note => ({ ...note, duration: elapsed - note.start }))];
          target.classList.toggle('empty', notes.length === 0);
          target.replaceChildren(...notes.map(note => {
            const item = document.createElement('i');
            const duration = Math.max(0.035, note.duration || 0.035);
            item.style.left = `${Math.max(0, Math.min(100, note.start / elapsed * 100))}%`;
            item.style.width = `${Math.max(0.7, Math.min(100, duration / elapsed * 100))}%`;
            item.style.top = `${Math.max(8, Math.min(92, ((84 - Math.min(84, Math.max(36, note.note))) / 48) * 100))}%`;
            item.style.opacity = String(0.5 + Math.min(1, note.velocity / 127) * 0.5);
            if (active.has(note.note)) item.classList.add('active');
            return item;
          }));
        }
      }

      frame = requestAnimationFrame(render);
    };

    const onMidi = (event: MIDIMessageEvent) => {
      if (!isRecording() || !activeMidiArticle()) return;
      const wanted = selectedInputId();
      const input = event.currentTarget as MIDIInput | null;
      if (wanted && input?.id !== wanted) return;
      const [command = 0, note = 0, velocity = 0] = Array.from(event.data || []);
      const type = command & 0xf0;
      const noteOn = type === 0x90 && velocity > 0;
      const noteOff = type === 0x80 || (type === 0x90 && velocity === 0);
      const position = Math.max(0, (performance.now() - startedAt) / 1000);
      if (noteOn) active.set(note, { note, velocity, start: position });
      if (noteOff) {
        const current = active.get(note);
        if (!current) return;
        completed.push({ ...current, duration: Math.max(0.04, position - current.start) });
        active.delete(note);
      }
    };

    const attachInputs = () => {
      if (!access) return;
      access.inputs.forEach(input => {
        if (attachedInputs.has(input.id)) return;
        input.addEventListener('midimessage', onMidi);
        attachedInputs.add(input.id);
      });
    };

    installStyle();
    const navigatorWithMidi = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> };
    if (navigatorWithMidi.requestMIDIAccess) {
      void navigatorWithMidi.requestMIDIAccess().then(result => {
        access = result;
        attachInputs();
        access.onstatechange = attachInputs;
      }).catch(() => undefined);
    }
    render();

    return () => {
      cancelAnimationFrame(frame);
      clearPreview();
      access?.inputs.forEach(input => input.removeEventListener('midimessage', onMidi));
      if (access) access.onstatechange = null;
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
