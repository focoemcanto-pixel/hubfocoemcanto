'use client';

import { useEffect } from 'react';
import type { VoiceStudioMidiNote, VoiceStudioProject } from './voice-studio-project-model';
import {
  preloadVoiceStudioPiano,
  startVoiceStudioPianoNote,
  stopAllVoiceStudioPianoNotes,
  stopVoiceStudioPianoNote,
} from './voice-studio-piano-engine';

const SNAPSHOT_EVENT = 'foco-voice-studio-snapshot';
const LOAD_EVENT = 'foco-voice-studio-load-project';
const REQUEST_EVENT = 'foco-voice-studio-request-snapshot';

type SnapshotDetail = { project: VoiceStudioProject; blobs?: Record<string, Blob> };
type ActiveMidiNote = { start: number; velocity: number };
type PendingMidiTake = { trackId: string; start: number; duration: number; notes: VoiceStudioMidiNote[] };

function trackArticles() {
  return Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)'));
}

function isMidiTrack(article: HTMLElement | null) {
  return Boolean(article?.querySelector(':scope > span svg'));
}

function trackName(article: HTMLElement | null) {
  return article?.querySelector<HTMLInputElement>(':scope > input')?.value?.trim() || 'Faixa';
}

function recordButton() {
  return document.querySelector<HTMLButtonElement>('.vs-daw-runtime .vs-main-controls button.record, .vs-daw-runtime .vs-main-controls button.recording');
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
    let bypassArmClick = false;
    let wasRecording = false;
    let recordingStartedAt = 0;
    let recordingStart = 0;
    let parallelMidiTrackId = '';
    let latestSnapshot: SnapshotDetail | null = null;
    let pendingMidiTake: PendingMidiTake | null = null;
    const armedTrackIds = new Set<string>();
    const soundingNotes = new Set<number>();
    const activeMidiNotes = new Map<number, ActiveMidiNote>();
    const capturedMidiNotes: VoiceStudioMidiNote[] = [];
    const controllerHandlers = new Map<string, ((this: MIDIInput, event: MIDIMessageEvent) => void) | null>();
    const runtimeHandlers = new Map<string, (this: MIDIInput, event: MIDIMessageEvent) => void>();

    const getAudioContext = () => {
      audioContext ||= new AudioContext({ latencyHint: 'interactive' });
      return audioContext;
    };

    const trackIdForArticle = (article: HTMLElement | null) => {
      if (!article || !latestSnapshot) return '';
      const index = trackArticles().indexOf(article);
      return latestSnapshot.project.tracks[index]?.id || '';
    };

    const articleForTrackId = (trackId: string) => {
      if (!latestSnapshot) return null;
      const index = latestSnapshot.project.tracks.findIndex(track => track.id === trackId);
      return index >= 0 ? trackArticles()[index] || null : null;
    };

    const trackKind = (trackId: string) => latestSnapshot?.project.tracks.find(track => track.id === trackId)?.kind;

    const stopAllNotes = () => {
      soundingNotes.forEach(note => stopVoiceStudioPianoNote(note, 0.05));
      soundingNotes.clear();
      activeMidiNotes.clear();
      stopAllVoiceStudioPianoNotes();
    };

    const ensurePanel = () => {
      const options = document.querySelector<HTMLElement>('.vs-daw-runtime .vs-options');
      if (!options) return null;
      let panel = options.querySelector<HTMLElement>(':scope > .vs-safe-track-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'vs-safe-track-panel';
        panel.innerHTML = '<strong></strong><label class="audio-device"><span>Entrada</span><select aria-label="Interface da faixa selecionada"></select></label><label class="audio-channel"><span>Canal</span><select aria-label="Canal da faixa selecionada"></select></label><i class="track-meter"><b></b></i><span class="midi-status">MIDI · Piano real</span><span class="armed-count"></span>';
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
      const count = panel.querySelector<HTMLElement>('.armed-count');
      if (title) title.textContent = selectedTrack ? trackName(selectedTrack) : 'Nenhuma faixa';
      if (count) count.textContent = armedTrackIds.size > 1 ? `${armedTrackIds.size} faixas armadas` : '';
      if (!selectedTrack || midi) return;
      const sourceDevice = selectedTrack.querySelector<HTMLSelectElement>('.vs-track-device-select');
      const sourceChannel = selectedTrack.querySelector<HTMLSelectElement>('.vs-track-channel-select');
      const targetDevice = panel.querySelector<HTMLSelectElement>('.audio-device select');
      const targetChannel = panel.querySelector<HTMLSelectElement>('.audio-channel select');
      if (sourceDevice && targetDevice) cloneSelect(sourceDevice, targetDevice);
      if (sourceChannel && targetChannel) cloneSelect(sourceChannel, targetChannel);
    };

    const syncArmVisuals = () => {
      trackArticles().forEach(article => {
        const trackId = trackIdForArticle(article);
        const armed = armedTrackIds.has(trackId);
        article.classList.toggle('vs-multi-armed', armed);
        const button = article.querySelector<HTMLButtonElement>('button[title="Armar track"]');
        button?.classList.toggle('recording', armed);
      });
      syncPanel();
    };

    const desiredPrimaryTrackId = () => {
      const ids = Array.from(armedTrackIds);
      return ids.find(id => trackKind(id) === 'audio') || ids[0] || '';
    };

    const setControllerPrimary = () => {
      const desiredId = desiredPrimaryTrackId();
      const currentArticle = trackArticles().find(article => article.classList.contains('armed-track')) || null;
      const currentId = trackIdForArticle(currentArticle);
      if (currentId === desiredId) return;
      const clickArm = (article: HTMLElement | null) => {
        const button = article?.querySelector<HTMLButtonElement>('button[title="Armar track"]');
        if (!button) return;
        bypassArmClick = true;
        button.click();
        bypassArmClick = false;
      };
      if (currentArticle) clickArm(currentArticle);
      if (desiredId) window.setTimeout(() => clickArm(articleForTrackId(desiredId)), 0);
    };

    const selectTrack = (article: HTMLElement | null) => {
      trackArticles().forEach(track => track.classList.toggle('vs-track-selected', track === article));
      selectedTrack = article;
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
      const primary = tracks.find(track => track.classList.contains('armed-track')) || tracks[0] || null;
      selectTrack(primary);
    };

    const selectedMidiInputId = () => {
      const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('.vs-daw-runtime .vs-options label'));
      return labels.find(label => label.textContent?.trim().startsWith('Teclado'))?.querySelector('select')?.value || '';
    };

    const callControllerSilently = (handler: ((this: MIDIInput, event: MIDIMessageEvent) => void) | null | undefined, input: MIDIInput, event: MIDIMessageEvent) => {
      if (!handler) return;
      const prototype = AudioContext.prototype as unknown as { createOscillator: AudioContext['createOscillator'] };
      const originalCreateOscillator = prototype.createOscillator;
      prototype.createOscillator = function (this: AudioContext) {
        const oscillator = originalCreateOscillator.call(this);
        (oscillator as unknown as { connect: (destination: AudioNode) => AudioNode }).connect = destination => destination;
        return oscillator;
      };
      try { handler.call(input, event); } finally { prototype.createOscillator = originalCreateOscillator; }
    };

    const captureParallelMidi = (note: number, velocity: number, noteOn: boolean, noteOff: boolean) => {
      if (!parallelMidiTrackId || !recordButtonIsActive()) return;
      const position = Math.max(0, (performance.now() - recordingStartedAt) / 1000);
      if (noteOn) activeMidiNotes.set(note, { start: position, velocity });
      if (noteOff) {
        const active = activeMidiNotes.get(note);
        if (!active) return;
        capturedMidiNotes.push({ id: crypto.randomUUID(), note, velocity: active.velocity, start: active.start, duration: Math.max(0.04, position - active.start) });
        activeMidiNotes.delete(note);
      }
    };

    const syncMidi = () => {
      if (!midiAccess) return;
      ensureSelectedTrack();
      const selectedId = trackIdForArticle(selectedTrack);
      const midiTrackReady = Boolean(selectedTrack?.isConnected && isMidiTrack(selectedTrack) && armedTrackIds.has(selectedId));
      const wantedInputId = selectedMidiInputId();

      midiAccess.inputs.forEach(input => {
        const runtimeHandler = runtimeHandlers.get(input.id);
        if (input.onmidimessage && input.onmidimessage !== runtimeHandler) controllerHandlers.set(input.id, input.onmidimessage);
        if (!midiTrackReady || (wantedInputId && input.id !== wantedInputId)) {
          if (input.onmidimessage === runtimeHandler) input.onmidimessage = null;
          return;
        }
        if (!runtimeHandler) {
          const nextHandler = function (this: MIDIInput, event: MIDIMessageEvent) {
            if (!selectedTrack?.isConnected || !isMidiTrack(selectedTrack) || !armedTrackIds.has(trackIdForArticle(selectedTrack))) return;
            const [command = 0, note = 0, velocity = 0] = Array.from(event.data || []);
            const type = command & 0xf0;
            const noteOn = type === 0x90 && velocity > 0;
            const noteOff = type === 0x80 || (type === 0x90 && velocity === 0);
            if (noteOn) {
              soundingNotes.add(note);
              void startVoiceStudioPianoNote(getAudioContext(), note, Math.max(0.08, velocity / 127));
            }
            if (noteOff) {
              soundingNotes.delete(note);
              stopVoiceStudioPianoNote(note);
            }
            captureParallelMidi(note, velocity, noteOn, noteOff);
            const primaryId = desiredPrimaryTrackId();
            if (recordButtonIsActive() && trackKind(primaryId) === 'midi' && !parallelMidiTrackId) {
              callControllerSilently(controllerHandlers.get(input.id), this, event);
            }
          };
          runtimeHandlers.set(input.id, nextHandler);
          input.onmidimessage = nextHandler;
        } else input.onmidimessage = runtimeHandler;
      });
    };

    const injectPendingMidiTake = () => {
      const take = pendingMidiTake;
      const snapshot = latestSnapshot;
      if (!take || !snapshot || !take.notes.length) { pendingMidiTake = null; return; }
      const project = structuredClone(snapshot.project);
      const track = project.tracks.find(item => item.id === take.trackId && item.kind === 'midi');
      if (!track) { pendingMidiTake = null; return; }
      const assetId = crypto.randomUUID();
      const clipId = crypto.randomUUID();
      const duration = Math.max(0.08, take.duration, ...take.notes.map(note => note.start + note.duration));
      project.assets[assetId] = { id: assetId, kind: 'midi', duration, createdAt: new Date().toISOString(), peaks: [], midiNotes: take.notes, instrument: track.instrument || 'piano' };
      track.clips.push({ id: clipId, assetId, name: track.name, start: take.start, sourceOffset: 0, duration, gain: 1, fadeIn: 0, fadeOut: 0, color: track.color, muted: false, locked: false });
      project.updatedAt = new Date().toISOString();
      pendingMidiTake = null;
      window.dispatchEvent(new CustomEvent(LOAD_EVENT, { detail: { project, blobs: snapshot.blobs, historyOperation: 'recording', historyLabel: 'Gravação simultânea MIDI' } }));
    };

    const syncRecordingState = () => {
      const recording = recordButtonIsActive();
      if (recording && !wasRecording) {
        recordingStartedAt = performance.now();
        recordingStart = latestSnapshot?.project.view.playhead || 0;
        capturedMidiNotes.length = 0;
        activeMidiNotes.clear();
        const primaryId = desiredPrimaryTrackId();
        parallelMidiTrackId = trackKind(primaryId) === 'audio' ? Array.from(armedTrackIds).find(id => trackKind(id) === 'midi') || '' : '';
      }
      if (!recording && wasRecording && parallelMidiTrackId) {
        const duration = Math.max(0.08, (performance.now() - recordingStartedAt) / 1000);
        activeMidiNotes.forEach((active, note) => capturedMidiNotes.push({ id: crypto.randomUUID(), note, velocity: active.velocity, start: active.start, duration: Math.max(0.04, duration - active.start) }));
        activeMidiNotes.clear();
        pendingMidiTake = { trackId: parallelMidiTrackId, start: recordingStart, duration, notes: [...capturedMidiNotes] };
        parallelMidiTrackId = '';
        window.setTimeout(injectPendingMidiTake, 220);
      }
      wasRecording = recording;
      const stop = document.querySelector<HTMLButtonElement>('.vs-daw-runtime .vs-main-controls button[title="Parar"]');
      if (stop && recording) stop.disabled = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const article = target.closest<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)');
      if (!article || target.closest('.vs-track-height-splitter')) return;
      selectTrack(article);
    };

    const handleClick = (event: MouseEvent) => {
      if (bypassArmClick) return;
      const target = event.target as HTMLElement;
      const armButton = target.closest<HTMLButtonElement>('button[title="Armar track"]');
      const article = armButton?.closest<HTMLElement>('.vs-track-heads > article:not(.armed)') || null;
      if (armButton && article) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const trackId = trackIdForArticle(article);
        if (!trackId) return;
        if (armedTrackIds.has(trackId)) armedTrackIds.delete(trackId); else armedTrackIds.add(trackId);
        setControllerPrimary();
        syncArmVisuals();
        window.setTimeout(syncMidi, 0);
        return;
      }
      const stopButton = target.closest<HTMLButtonElement>('.vs-main-controls button[title="Parar"]');
      if (stopButton && recordButtonIsActive()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        recordButton()?.click();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !recordButtonIsActive()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      recordButton()?.click();
    };

    const handleChange = (event: Event) => {
      const target = event.target as HTMLSelectElement;
      const panel = target.closest('.vs-safe-track-panel');
      if (!panel || !selectedTrack) return;
      const source = target.closest('.audio-device') ? selectedTrack.querySelector<HTMLSelectElement>('.vs-track-device-select') : selectedTrack.querySelector<HTMLSelectElement>('.vs-track-channel-select');
      if (!source) return;
      source.value = target.value;
      source.dispatchEvent(new Event('change', { bubbles: true }));
      window.setTimeout(syncPanel, 0);
    };

    const handleSnapshot = (event: Event) => {
      const detail = (event as CustomEvent<SnapshotDetail>).detail;
      if (!detail?.project) return;
      latestSnapshot = detail;
      const existingIds = new Set(detail.project.tracks.map(track => track.id));
      Array.from(armedTrackIds).forEach(id => { if (!existingIds.has(id)) armedTrackIds.delete(id); });
      if (!armedTrackIds.size) {
        const primaryArticle = trackArticles().find(article => article.classList.contains('armed-track'));
        const primaryId = trackIdForArticle(primaryArticle || null);
        if (primaryId) armedTrackIds.add(primaryId);
      }
      syncArmVisuals();
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
    document.addEventListener('click', handleClick, true);
    document.addEventListener('change', handleChange, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener(SNAPSHOT_EVENT, handleSnapshot);

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

    window.dispatchEvent(new Event(REQUEST_EVENT));
    ensureSelectedTrack();
    syncPanel();
    paintMeter();
    timer = window.setInterval(() => {
      syncRecordingState();
      syncMidi();
      syncPanel();
      syncArmVisuals();
    }, 40);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('change', handleChange, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener(SNAPSHOT_EVENT, handleSnapshot);
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
