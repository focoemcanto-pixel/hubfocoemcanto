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
type ActiveNote = { start: number; velocity: number };
type PendingTake = {
  trackId: string;
  start: number;
  duration: number;
  notes: VoiceStudioMidiNote[];
  previousClipIds: Set<string>;
};

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

function isRecording() {
  return Boolean(document.querySelector('.vs-daw-runtime .vs-main-controls button.recording'));
}

function keyboardSelect() {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('.vs-daw-runtime .vs-options label'));
  return labels.find(label => label.textContent?.trim().startsWith('Teclado'))?.querySelector<HTMLSelectElement>('select') || null;
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

export default function VoiceStudioMidiRoutingRuntime() {
  useEffect(() => {
    let selectedTrack: HTMLElement | null = null;
    let latestSnapshot: SnapshotDetail | null = null;
    let midiAccess: MIDIAccess | null = null;
    let audioContext: AudioContext | null = null;
    let timer = 0;
    let meterFrame = 0;
    let bypassArmClick = false;
    let wasRecording = false;
    let recordingStartedAt = 0;
    let recordingStart = 0;
    let recordingMidiTrackId = '';
    let pendingTake: PendingTake | null = null;

    const armedTrackIds = new Set<string>();
    const soundingNotes = new Set<number>();
    const activeNotes = new Map<number, ActiveNote>();
    const capturedNotes: VoiceStudioMidiNote[] = [];
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
      soundingNotes.forEach(note => stopVoiceStudioPianoNote(note, 0.08));
      soundingNotes.clear();
      stopAllVoiceStudioPianoNotes();
    };

    const ensurePanel = () => {
      const options = document.querySelector<HTMLElement>('.vs-daw-runtime .vs-options');
      if (!options) return null;
      let panel = options.querySelector<HTMLElement>(':scope > .vs-safe-track-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'vs-safe-track-panel';
        panel.innerHTML = '<strong></strong><label class="audio-device"><span>Entrada</span><select aria-label="Interface da faixa selecionada"></select></label><label class="audio-channel"><span>Canal</span><select aria-label="Canal da faixa selecionada"></select></label><i class="track-meter"><b></b></i><span class="midi-status">MIDI · Piano multisample</span><span class="armed-count"></span>';
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
        article.querySelector<HTMLButtonElement>('button[title="Armar track"]')?.classList.toggle('recording', armed);
      });
      syncPanel();
    };

    const desiredPrimaryTrackId = () => {
      const ids = Array.from(armedTrackIds);
      return ids.find(id => trackKind(id) === 'audio') || ids[0] || '';
    };

    const clickControllerArm = (article: HTMLElement | null) => {
      const button = article?.querySelector<HTMLButtonElement>('button[title="Armar track"]');
      if (!button) return;
      bypassArmClick = true;
      button.click();
      bypassArmClick = false;
    };

    const setControllerPrimary = () => {
      const desiredId = desiredPrimaryTrackId();
      const currentArticle = trackArticles().find(article => article.classList.contains('armed-track')) || null;
      const currentId = trackIdForArticle(currentArticle);
      if (currentId === desiredId) return;
      if (currentArticle) clickControllerArm(currentArticle);
      if (desiredId) window.setTimeout(() => clickControllerArm(articleForTrackId(desiredId)), 0);
    };

    const selectTrack = (article: HTMLElement | null) => {
      trackArticles().forEach(track => track.classList.toggle('vs-track-selected', track === article));
      selectedTrack = article;
      if (!isMidiTrack(article)) stopAllNotes();
      syncPanel();
      window.setTimeout(syncMidiRouting, 0);
    };

    const ensureSelectedTrack = () => {
      if (selectedTrack?.isConnected) {
        selectedTrack.classList.add('vs-track-selected');
        return;
      }
      const tracks = trackArticles();
      selectTrack(tracks.find(track => track.classList.contains('armed-track')) || tracks[0] || null);
    };

    const selectedMidiInputId = () => keyboardSelect()?.value || '';

    const ensureMidiInputSelected = () => {
      const select = keyboardSelect();
      if (!select || select.value) return;
      const first = Array.from(select.options).find(option => option.value);
      if (!first) return;
      select.value = first.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const captureMidi = (note: number, velocity: number, noteOn: boolean, noteOff: boolean) => {
      if (!recordingMidiTrackId || !isRecording()) return;
      const position = Math.max(0, (performance.now() - recordingStartedAt) / 1000);
      if (noteOn) activeNotes.set(note, { start: position, velocity });
      if (noteOff) {
        const active = activeNotes.get(note);
        if (!active) return;
        capturedNotes.push({
          id: crypto.randomUUID(),
          note,
          velocity: active.velocity,
          start: active.start,
          duration: Math.max(0.04, position - active.start),
        });
        activeNotes.delete(note);
      }
    };

    const syncMidiRouting = () => {
      if (!midiAccess) return;
      ensureSelectedTrack();
      const selectedId = trackIdForArticle(selectedTrack);
      const midiReady = Boolean(selectedTrack?.isConnected && isMidiTrack(selectedTrack) && armedTrackIds.has(selectedId));
      const wantedInputId = selectedMidiInputId();

      midiAccess.inputs.forEach(input => {
        const existing = runtimeHandlers.get(input.id);
        if (!midiReady || (wantedInputId && input.id !== wantedInputId)) {
          if (input.onmidimessage === existing) input.onmidimessage = null;
          return;
        }

        if (!existing) {
          const handler = function (this: MIDIInput, event: MIDIMessageEvent) {
            const currentId = trackIdForArticle(selectedTrack);
            if (!selectedTrack?.isConnected || !isMidiTrack(selectedTrack) || !armedTrackIds.has(currentId)) return;
            const [command = 0, note = 0, velocity = 0] = Array.from(event.data || []);
            const type = command & 0xf0;
            const noteOn = type === 0x90 && velocity > 0;
            const noteOff = type === 0x80 || (type === 0x90 && velocity === 0);

            if (noteOn) {
              soundingNotes.add(note);
              void startVoiceStudioPianoNote(getAudioContext(), note, Math.max(0.05, velocity / 127));
            }
            if (noteOff) {
              soundingNotes.delete(note);
              stopVoiceStudioPianoNote(note);
            }
            captureMidi(note, velocity, noteOn, noteOff);
          };
          runtimeHandlers.set(input.id, handler);
          input.onmidimessage = handler;
        } else if (input.onmidimessage !== existing) {
          input.onmidimessage = existing;
        }
      });
    };

    const injectPendingTake = () => {
      const take = pendingTake;
      const snapshot = latestSnapshot;
      if (!take || !snapshot) return;

      const project = structuredClone(snapshot.project);
      const track = project.tracks.find(item => item.id === take.trackId && item.kind === 'midi');
      if (!track) { pendingTake = null; return; }

      const removedAssetIds = new Set<string>();
      track.clips = track.clips.filter(clip => {
        if (take.previousClipIds.has(clip.id)) return true;
        const asset = project.assets[clip.assetId];
        const emptyControllerTake = asset?.kind === 'midi' && (asset.midiNotes?.length || 0) === 0;
        if (emptyControllerTake) removedAssetIds.add(clip.assetId);
        return !emptyControllerTake;
      });
      removedAssetIds.forEach(assetId => {
        const stillUsed = project.tracks.some(item => item.clips.some(clip => clip.assetId === assetId));
        if (!stillUsed) delete project.assets[assetId];
      });

      if (take.notes.length) {
        const assetId = crypto.randomUUID();
        const duration = Math.max(0.08, take.duration, ...take.notes.map(note => note.start + note.duration));
        project.assets[assetId] = {
          id: assetId,
          kind: 'midi',
          duration,
          createdAt: new Date().toISOString(),
          peaks: [],
          midiNotes: take.notes,
          instrument: track.instrument || 'piano',
        };
        track.clips.push({
          id: crypto.randomUUID(),
          assetId,
          name: track.name,
          start: take.start,
          sourceOffset: 0,
          duration,
          gain: 1,
          fadeIn: 0,
          fadeOut: 0,
          color: track.color,
          muted: false,
          locked: false,
        });
      }

      project.updatedAt = new Date().toISOString();
      pendingTake = null;
      window.dispatchEvent(new CustomEvent(LOAD_EVENT, {
        detail: {
          project,
          blobs: snapshot.blobs,
          historyOperation: 'recording',
          historyLabel: 'Gravação MIDI',
        },
      }));
    };

    const scheduleTakeInjection = () => {
      window.dispatchEvent(new Event(REQUEST_EVENT));
      window.setTimeout(() => {
        window.dispatchEvent(new Event(REQUEST_EVENT));
        window.setTimeout(injectPendingTake, 220);
      }, 220);
    };

    const syncRecordingState = () => {
      const recording = isRecording();
      if (recording && !wasRecording) {
        recordingStartedAt = performance.now();
        recordingStart = latestSnapshot?.project.view.playhead || 0;
        capturedNotes.length = 0;
        activeNotes.clear();
        recordingMidiTrackId = Array.from(armedTrackIds).find(id => trackKind(id) === 'midi') || '';
        const midiTrack = latestSnapshot?.project.tracks.find(track => track.id === recordingMidiTrackId);
        pendingTake = recordingMidiTrackId ? {
          trackId: recordingMidiTrackId,
          start: recordingStart,
          duration: 0,
          notes: [],
          previousClipIds: new Set(midiTrack?.clips.map(clip => clip.id) || []),
        } : null;
      }

      if (!recording && wasRecording && recordingMidiTrackId && pendingTake) {
        const duration = Math.max(0.08, (performance.now() - recordingStartedAt) / 1000);
        activeNotes.forEach((active, note) => capturedNotes.push({
          id: crypto.randomUUID(),
          note,
          velocity: active.velocity,
          start: active.start,
          duration: Math.max(0.04, duration - active.start),
        }));
        activeNotes.clear();
        pendingTake = { ...pendingTake, duration, notes: [...capturedNotes] };
        recordingMidiTrackId = '';
        scheduleTakeInjection();
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
        if (!latestSnapshot) {
          window.dispatchEvent(new Event(REQUEST_EVENT));
          return;
        }
        const trackId = trackIdForArticle(article);
        if (!trackId) return;
        if (armedTrackIds.has(trackId)) armedTrackIds.delete(trackId); else armedTrackIds.add(trackId);
        setControllerPrimary();
        syncArmVisuals();
        window.setTimeout(syncMidiRouting, 0);
        return;
      }

      const clickedRecord = Boolean(target.closest('.vs-main-controls button.record'));
      if (clickedRecord && Array.from(armedTrackIds).some(id => trackKind(id) === 'midi')) ensureMidiInputSelected();

      const stopButton = target.closest<HTMLButtonElement>('.vs-main-controls button[title="Parar"]');
      if (stopButton && isRecording()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        recordButton()?.click();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !isRecording()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      recordButton()?.click();
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
        access.onstatechange = syncMidiRouting;
        void preloadVoiceStudioPiano(getAudioContext()).catch(() => undefined);
        syncMidiRouting();
      }).catch(() => undefined);
    }

    [0, 120, 350, 800].forEach(delay => window.setTimeout(() => window.dispatchEvent(new Event(REQUEST_EVENT)), delay));
    ensureSelectedTrack();
    syncPanel();
    paintMeter();
    timer = window.setInterval(() => {
      syncRecordingState();
      syncMidiRouting();
      syncPanel();
      syncArmVisuals();
    }, 30);

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
