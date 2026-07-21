'use client';

import { useEffect } from 'react';
import {
  preloadVoiceStudioPiano,
  startVoiceStudioPianoNote,
  stopAllVoiceStudioPianoNotes,
  stopVoiceStudioPianoNote,
} from './voice-studio-piano-engine';

function trackArticles() {
  return Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)'));
}

function isMidiTrack(article: HTMLElement | null) {
  return Boolean(article?.querySelector(':scope > span svg'));
}

function trackName(article: HTMLElement | null) {
  return article?.querySelector<HTMLInputElement>(':scope > input')?.value?.trim() || 'Faixa';
}

function recordButtonIsActive() {
  return Boolean(document.querySelector('.vs-daw-runtime .vs-main-controls button.recording'));
}

function cloneSelect(source: HTMLSelectElement, target: HTMLSelectElement) {
  const signature = Array.from(source.options).map(option => `${option.value}:${option.textContent}`).join('|');
  if (target.dataset.signature !== signature) {
    target.replaceChildren(...Array.from(source.options).map(option => option.cloneNode(true)));
    target.dataset.signature = signature;
  }
  target.value = source.value;
  target.disabled = source.disabled;
}

export default function VoiceStudioSafeTrackRuntime() {
  useEffect(() => {
    let selectedTrack: HTMLElement | null = null;
    let midiAccess: MIDIAccess | null = null;
    let audioContext: AudioContext | null = null;
    let timer = 0;
    let meterFrame = 0;
    const activeNotes = new Set<number>();
    const controllerHandlers = new Map<string, ((this: MIDIInput, event: MIDIMessageEvent) => void) | null>();
    const runtimeHandlers = new Map<string, (this: MIDIInput, event: MIDIMessageEvent) => void>();

    const getAudioContext = () => {
      audioContext ||= new AudioContext({ latencyHint: 'interactive' });
      return audioContext;
    };

    const stopAllNotes = () => {
      activeNotes.forEach(note => stopVoiceStudioPianoNote(note, 0.05));
      activeNotes.clear();
      stopAllVoiceStudioPianoNotes();
    };

    const ensurePanel = () => {
      const options = document.querySelector<HTMLElement>('.vs-daw-runtime .vs-options');
      if (!options) return null;
      let panel = options.querySelector<HTMLElement>(':scope > .vs-safe-track-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'vs-safe-track-panel';
        panel.innerHTML = '<strong></strong><label class="audio-device"><span>Entrada</span><select aria-label="Interface da faixa selecionada"></select></label><label class="audio-channel"><span>Canal</span><select aria-label="Canal da faixa selecionada"></select></label><i class="track-meter"><b></b></i><span class="midi-status">MIDI · Piano real</span>';
        options.prepend(panel);
      }
      return panel;
    };

    const syncPanel = () => {
      const panel = ensurePanel();
      if (!panel) return;
      const midi = isMidiTrack(selectedTrack);
      panel.classList.toggle('midi', midi);
      panel.classList.toggle('audio', Boolean(selectedTrack) && !midi);
      const title = panel.querySelector<HTMLElement>('strong');
      if (title) title.textContent = selectedTrack ? trackName(selectedTrack) : 'Nenhuma faixa';
      if (!selectedTrack || midi) return;
      const sourceDevice = selectedTrack.querySelector<HTMLSelectElement>('.vs-track-device-select');
      const sourceChannel = selectedTrack.querySelector<HTMLSelectElement>('.vs-track-channel-select');
      const targetDevice = panel.querySelector<HTMLSelectElement>('.audio-device select');
      const targetChannel = panel.querySelector<HTMLSelectElement>('.audio-channel select');
      if (sourceDevice && targetDevice) cloneSelect(sourceDevice, targetDevice);
      if (sourceChannel && targetChannel) cloneSelect(sourceChannel, targetChannel);
    };

    const selectTrack = (article: HTMLElement | null, arm: boolean) => {
      trackArticles().forEach(track => track.classList.toggle('vs-track-selected', track === article));
      selectedTrack = article;
      if (arm && article && !article.classList.contains('armed-track')) {
        article.querySelector<HTMLButtonElement>('button[title="Armar track"]')?.click();
      }
      if (!isMidiTrack(article)) stopAllNotes();
      syncPanel();
      window.setTimeout(syncMidi, 0);
    };

    const ensureSelectedTrack = () => {
      const tracks = trackArticles();
      if (selectedTrack?.isConnected) {
        selectedTrack.classList.add('vs-track-selected');
        return;
      }
      const armed = tracks.find(track => track.classList.contains('armed-track')) || tracks[0] || null;
      selectTrack(armed, false);
    };

    const syncMidi = () => {
      if (!midiAccess) return;
      ensureSelectedTrack();
      const midiTrackReady = Boolean(selectedTrack?.isConnected && isMidiTrack(selectedTrack) && selectedTrack.classList.contains('armed-track'));

      midiAccess.inputs.forEach(input => {
        const runtimeHandler = runtimeHandlers.get(input.id);
        if (input.onmidimessage && input.onmidimessage !== runtimeHandler) controllerHandlers.set(input.id, input.onmidimessage);

        if (!midiTrackReady) {
          input.onmidimessage = null;
          return;
        }

        if (!runtimeHandler) {
          const nextHandler = function (this: MIDIInput, event: MIDIMessageEvent) {
            if (!selectedTrack?.isConnected || !isMidiTrack(selectedTrack) || !selectedTrack.classList.contains('armed-track')) return;
            const [command = 0, note = 0, velocity = 0] = Array.from(event.data || []);
            const type = command & 0xf0;
            const noteOn = type === 0x90 && velocity > 0;
            const noteOff = type === 0x80 || (type === 0x90 && velocity === 0);

            if (noteOn) {
              activeNotes.add(note);
              void startVoiceStudioPianoNote(getAudioContext(), note, Math.max(0.08, velocity / 127));
            }
            if (noteOff) {
              activeNotes.delete(note);
              stopVoiceStudioPianoNote(note);
            }

            if (recordButtonIsActive()) controllerHandlers.get(input.id)?.call(this, event);
          };
          runtimeHandlers.set(input.id, nextHandler);
          input.onmidimessage = nextHandler;
        } else {
          input.onmidimessage = runtimeHandler;
        }
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const article = target.closest<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)');
      if (!article || target.closest('.vs-track-height-splitter')) return;
      const isControl = Boolean(target.closest('button,input,select,label'));
      selectTrack(article, !isControl);
    };

    const handleChange = (event: Event) => {
      const target = event.target as HTMLSelectElement;
      const panel = target.closest('.vs-safe-track-panel');
      if (!panel || !selectedTrack) return;
      const source = target.closest('.audio-device')
        ? selectedTrack.querySelector<HTMLSelectElement>('.vs-track-device-select')
        : selectedTrack.querySelector<HTMLSelectElement>('.vs-track-channel-select');
      if (!source) return;
      source.value = target.value;
      source.dispatchEvent(new Event('change', { bubbles: true }));
      window.setTimeout(syncPanel, 0);
    };

    const paintMeter = () => {
      const panel = ensurePanel();
      if (panel && selectedTrack && !isMidiTrack(selectedTrack)) {
        const source = selectedTrack.querySelector<HTMLElement>('.vs-track-meter b');
        const target = panel.querySelector<HTMLElement>('.track-meter b');
        if (source && target) target.style.width = source.style.width || getComputedStyle(source).width;
      }
      meterFrame = requestAnimationFrame(paintMeter);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('change', handleChange, true);

    const navigatorWithMidi = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> };
    if (navigatorWithMidi.requestMIDIAccess) {
      void navigatorWithMidi.requestMIDIAccess().then(access => {
        midiAccess = access;
        access.onstatechange = () => syncMidi();
        const context = getAudioContext();
        void preloadVoiceStudioPiano(context).catch(() => undefined);
        syncMidi();
      }).catch(() => undefined);
    }

    ensureSelectedTrack();
    syncPanel();
    paintMeter();
    timer = window.setInterval(() => {
      syncMidi();
      syncPanel();
    }, 40);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('change', handleChange, true);
      window.clearInterval(timer);
      cancelAnimationFrame(meterFrame);
      stopAllNotes();
      midiAccess?.inputs.forEach(input => { input.onmidimessage = null; });
      if (midiAccess) midiAccess.onstatechange = null;
      document.querySelector('.vs-daw-runtime .vs-options > .vs-safe-track-panel')?.remove();
      void audioContext?.close().catch(() => undefined);
    };
  }, []);

  return null;
}
