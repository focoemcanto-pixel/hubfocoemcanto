'use client';

import { useEffect } from 'react';
import {
  preloadPianoSamples,
  startPianoLiveNote,
  stopAllPianoLiveNotes,
  stopPianoLiveNote,
} from '@/lib/audio/piano-sample-engine';

function trackArticles() {
  return Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)'));
}

function isMidiTrack(article: HTMLElement | null) {
  return Boolean(article?.querySelector(':scope > span svg'));
}

function recordButtonIsActive() {
  return Boolean(document.querySelector('.vs-daw-runtime .vs-main-controls button.recording'));
}

export default function VoiceStudioSafeTrackRuntime() {
  useEffect(() => {
    let selectedTrack: HTMLElement | null = null;
    let midiAccess: MIDIAccess | null = null;
    let audioContext: AudioContext | null = null;
    let timer = 0;
    const activeNotes = new Set<number>();
    const controllerHandlers = new Map<string, ((this: MIDIInput, event: MIDIMessageEvent) => void) | null>();
    const runtimeHandlers = new Map<string, (this: MIDIInput, event: MIDIMessageEvent) => void>();

    const getAudioContext = () => {
      audioContext ||= new AudioContext({ latencyHint: 'interactive' });
      return audioContext;
    };

    const stopAllNotes = () => {
      activeNotes.forEach(note => stopPianoLiveNote(note, 0.06));
      activeNotes.clear();
      stopAllPianoLiveNotes();
    };

    const selectTrack = (article: HTMLElement | null, arm: boolean) => {
      trackArticles().forEach(track => track.classList.toggle('vs-track-selected', track === article));
      selectedTrack = article;
      if (arm && article && !article.classList.contains('armed-track')) {
        article.querySelector<HTMLButtonElement>('button[title="Armar track"]')?.click();
      }
      if (!isMidiTrack(article)) stopAllNotes();
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
      const midiTrackReady = Boolean(
        selectedTrack?.isConnected
        && isMidiTrack(selectedTrack)
        && selectedTrack.classList.contains('armed-track'),
      );

      midiAccess.inputs.forEach(input => {
        const runtimeHandler = runtimeHandlers.get(input.id);

        if (!midiTrackReady) {
          if (input.onmidimessage === runtimeHandler) input.onmidimessage = null;
          return;
        }

        if (input.onmidimessage && input.onmidimessage !== runtimeHandler) {
          controllerHandlers.set(input.id, input.onmidimessage);
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
              void startPianoLiveNote(getAudioContext(), note, Math.max(0.08, velocity / 127));
            }
            if (noteOff) {
              activeNotes.delete(note);
              stopPianoLiveNote(note);
            }

            if (recordButtonIsActive()) controllerHandlers.get(input.id)?.call(this, event);
          };
          runtimeHandlers.set(input.id, nextHandler);
          input.onmidimessage = nextHandler;
        } else if (input.onmidimessage !== runtimeHandler) {
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

    document.addEventListener('pointerdown', handlePointerDown, true);

    const navigatorWithMidi = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (navigatorWithMidi.requestMIDIAccess) {
      void navigatorWithMidi.requestMIDIAccess().then(access => {
        midiAccess = access;
        const refresh = () => syncMidi();
        access.onstatechange = refresh;
        const context = getAudioContext();
        void preloadPianoSamples(context).catch(() => undefined);
        syncMidi();
      }).catch(() => undefined);
    }

    ensureSelectedTrack();
    timer = window.setInterval(syncMidi, 250);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.clearInterval(timer);
      stopAllNotes();
      midiAccess?.inputs.forEach(input => {
        const runtimeHandler = runtimeHandlers.get(input.id);
        if (input.onmidimessage === runtimeHandler) input.onmidimessage = null;
      });
      if (midiAccess) midiAccess.onstatechange = null;
      void audioContext?.close().catch(() => undefined);
    };
  }, []);

  return null;
}
