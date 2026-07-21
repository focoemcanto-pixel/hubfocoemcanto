'use client';

import { useEffect } from 'react';
import { preloadPianoSamples, startPianoLiveNote, stopAllPianoLiveNotes, stopPianoLiveNote } from '@/lib/audio/piano-sample-engine';

type MidiMessageLike = { data: Uint8Array | number[] };
type MidiInputLike = { id: string; onmidimessage: ((event: MidiMessageLike) => void) | null };
type MidiAccessLike = { inputs: Map<string, MidiInputLike> };

function isMidiArticle(article: HTMLElement | null) {
  return Boolean(article?.querySelector(':scope > span svg'));
}

function trackName(article: HTMLElement | null) {
  return article?.querySelector<HTMLInputElement>(':scope > input')?.value?.trim() || 'Faixa';
}

function armButton(article: HTMLElement | null) {
  return article?.querySelector<HTMLButtonElement>('button[title="Armar track"]') || null;
}

function isRecording() {
  return Boolean(document.querySelector('.vs-daw-runtime .vs-main-controls button.recording'));
}

function cloneOptions(source: HTMLSelectElement, target: HTMLSelectElement) {
  const signature = Array.from(source.options).map(option => `${option.value}:${option.textContent}`).join('|');
  if (target.dataset.signature !== signature) {
    target.replaceChildren(...Array.from(source.options).map(option => option.cloneNode(true)));
    target.dataset.signature = signature;
  }
  target.value = source.value;
  target.disabled = source.disabled;
}

export default function VoiceStudioTrackRoutingRuntime() {
  useEffect(() => {
    let selectedArticle: HTMLElement | null = null;
    let midiAccess: MidiAccessLike | null = null;
    let audioContext: AudioContext | null = null;
    let animationFrame = 0;
    let interval = 0;
    const activeNotes = new Set<number>();
    const delegates = new Map<string, ((event: MidiMessageLike) => void) | null>();
    const wrappers = new Map<string, (event: MidiMessageLike) => void>();

    const getContext = () => {
      audioContext ||= new AudioContext({ latencyHint: 'interactive' });
      return audioContext;
    };

    const allArticles = () => Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)'));

    const setSelected = (article: HTMLElement | null, shouldArm = true) => {
      if (selectedArticle === article && article?.isConnected) {
        article.classList.add('vs-track-selected');
        return;
      }
      selectedArticle?.classList.remove('vs-track-selected');
      selectedArticle = article;
      selectedArticle?.classList.add('vs-track-selected');
      if (shouldArm && article && !article.classList.contains('armed-track')) armButton(article)?.click();
      if (article && isMidiArticle(article)) {
        const context = getContext();
        void context.resume().catch(() => undefined);
        void preloadPianoSamples(context);
      } else {
        activeNotes.forEach(note => stopPianoLiveNote(note, 0.08));
        activeNotes.clear();
      }
      syncRoutingPanel();
    };

    const ensureSelection = () => {
      const articles = allArticles();
      if (selectedArticle?.isConnected) {
        selectedArticle.classList.add('vs-track-selected');
        return;
      }
      const armed = articles.find(article => article.classList.contains('armed-track')) || articles[0] || null;
      setSelected(armed, false);
    };

    const getRoutingPanel = () => {
      const options = document.querySelector<HTMLElement>('.vs-daw-runtime .vs-options');
      if (!options) return null;
      let panel = options.querySelector<HTMLElement>(':scope > .vs-selected-track-routing');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'vs-selected-track-routing';
        panel.innerHTML = '<strong class="vs-routing-track"></strong><label class="vs-routing-device"><span>Entrada</span><select aria-label="Interface de áudio da faixa selecionada"></select></label><label class="vs-routing-channel"><span>Canal</span><select aria-label="Canal físico da faixa selecionada"></select></label><i class="vs-routing-meter" title="Nível do canal selecionado"><b></b></i><span class="vs-routing-midi">MIDI · Piano real do Hub</span>';
        const fit = options.querySelector(':scope > .vs-fit-tools');
        options.insertBefore(panel, fit || null);
      }
      return panel;
    };

    const syncRoutingPanel = () => {
      ensureSelection();
      const panel = getRoutingPanel();
      if (!panel) return;
      const article = selectedArticle;
      const midi = isMidiArticle(article);
      panel.classList.toggle('midi', midi);
      panel.classList.toggle('audio', Boolean(article) && !midi);
      panel.querySelector<HTMLElement>('.vs-routing-track')!.textContent = article ? trackName(article) : 'Nenhuma faixa';

      if (!article || midi) return;
      const originalDevice = article.querySelector<HTMLSelectElement>('.vs-track-device-select');
      const originalChannel = article.querySelector<HTMLSelectElement>('.vs-track-channel-select');
      const proxyDevice = panel.querySelector<HTMLSelectElement>('.vs-routing-device select');
      const proxyChannel = panel.querySelector<HTMLSelectElement>('.vs-routing-channel select');
      if (originalDevice && proxyDevice) cloneOptions(originalDevice, proxyDevice);
      if (originalChannel && proxyChannel) cloneOptions(originalChannel, proxyChannel);
    };

    const onProxyChange = (event: Event) => {
      const target = event.target as HTMLSelectElement;
      if (!selectedArticle) return;
      const original = target.closest('.vs-routing-device')
        ? selectedArticle.querySelector<HTMLSelectElement>('.vs-track-device-select')
        : selectedArticle.querySelector<HTMLSelectElement>('.vs-track-channel-select');
      if (!original) return;
      original.value = target.value;
      original.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const paintMeter = () => {
      const panel = getRoutingPanel();
      if (panel && selectedArticle && !isMidiArticle(selectedArticle)) {
        const source = selectedArticle.querySelector<HTMLElement>('.vs-track-meter b');
        const target = panel.querySelector<HTMLElement>('.vs-routing-meter b');
        if (source && target) target.style.width = source.style.width || getComputedStyle(source).width;
      }
      animationFrame = requestAnimationFrame(paintMeter);
    };

    const stopMidiRouting = () => {
      const notes = Array.from(activeNotes);
      midiAccess?.inputs.forEach(input => {
        const delegate = delegates.get(input.id);
        notes.forEach(note => delegate?.({ data: [0x80, note, 0] }));
        input.onmidimessage = null;
      });
      notes.forEach(note => stopPianoLiveNote(note, 0.08));
      activeNotes.clear();
      stopAllPianoLiveNotes();
    };

    const syncMidiRouting = () => {
      if (!midiAccess) return;
      ensureSelection();
      const midiSelected = Boolean(selectedArticle?.isConnected && isMidiArticle(selectedArticle) && selectedArticle.classList.contains('armed-track'));
      if (!midiSelected) {
        stopMidiRouting();
        return;
      }

      const timbreLabel = Array.from(document.querySelectorAll<HTMLElement>('.vs-daw-runtime .vs-options label')).find(label => /timbre/i.test(label.textContent || ''));
      const timbre = timbreLabel?.querySelector<HTMLSelectElement>('select');
      if (timbre && timbre.value !== 'piano') {
        timbre.value = 'piano';
        timbre.dispatchEvent(new Event('change', { bubbles: true }));
      }

      midiAccess.inputs.forEach(input => {
        const wrapper = wrappers.get(input.id);
        if (input.onmidimessage && input.onmidimessage !== wrapper) delegates.set(input.id, input.onmidimessage);
        if (!wrapper) {
          const nextWrapper = (event: MidiMessageLike) => {
            if (!selectedArticle?.isConnected || !isMidiArticle(selectedArticle) || !selectedArticle.classList.contains('armed-track')) return;
            const [command = 0, note = 0, velocity = 0] = Array.from(event.data);
            const type = command & 0xf0;
            const noteOn = type === 0x90 && velocity > 0;
            const noteOff = type === 0x80 || (type === 0x90 && velocity === 0);
            if (noteOn) {
              activeNotes.add(note);
              void startPianoLiveNote(getContext(), note, Math.max(0.08, velocity / 127));
            }
            if (noteOff) {
              activeNotes.delete(note);
              stopPianoLiveNote(note);
            }
            if (isRecording()) delegates.get(input.id)?.(event);
          };
          wrappers.set(input.id, nextWrapper);
          input.onmidimessage = nextWrapper;
        } else if (input.onmidimessage !== wrapper) {
          input.onmidimessage = wrapper;
        }
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const article = target.closest<HTMLElement>('.vs-daw-runtime .vs-track-heads > article:not(.armed)');
      if (!article || target.closest('.vs-track-height-splitter')) return;
      const interactingWithControl = Boolean(target.closest('button,input,select,label'));
      setSelected(article, !interactingWithControl);
    };

    const onChange = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.vs-selected-track-routing select')) onProxyChange(event);
    };

    const observer = new MutationObserver(() => {
      ensureSelection();
      syncRoutingPanel();
      syncMidiRouting();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value', 'disabled'] });
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('change', onChange, true);

    const navigatorWithMidi = navigator as Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> };
    if (navigatorWithMidi.requestMIDIAccess) {
      void navigatorWithMidi.requestMIDIAccess().then(access => {
        midiAccess = access;
        syncMidiRouting();
      }).catch(() => undefined);
    }

    ensureSelection();
    syncRoutingPanel();
    paintMeter();
    interval = window.setInterval(() => {
      syncRoutingPanel();
      syncMidiRouting();
    }, 220);

    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('change', onChange, true);
      cancelAnimationFrame(animationFrame);
      window.clearInterval(interval);
      stopMidiRouting();
      void audioContext?.close().catch(() => undefined);
    };
  }, []);

  return null;
}
