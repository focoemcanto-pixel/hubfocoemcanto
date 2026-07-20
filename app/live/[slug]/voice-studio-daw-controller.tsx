'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, ChevronDown, Circle, Copy, Download, KeyboardMusic, Magnet, Mic2, Pause, Play, Plus, Redo2, Scissors, Square, Trash2, Undo2, Volume2, ZoomIn, ZoomOut, Maximize2, Focus } from 'lucide-react';
import {
  cloneVoiceStudioProject,
  copyClip,
  createTrackContainer,
  createVoiceStudioProject,
  deleteClip,
  duplicateClip,
  findClip,
  moveClip,
  normalizeVoiceStudioProject,
  pasteClip,
  projectDuration,
  splitClip,
  trimClipEnd,
  trimClipStart,
  updateClipFade,
  type VoiceStudioAsset,
  type VoiceStudioClip,
  type VoiceStudioClipboardClip,
  type VoiceStudioMidiNote,
  type VoiceStudioProject,
  type VoiceStudioTrack,
  type VoiceStudioTrackKind,
} from './voice-studio-project-model';
import { VoiceStudioHistoryEngine, type VoiceStudioHistoryOperation } from './voice-studio-history-engine';
import { createObjectUrls, revokeObjectUrls } from './voice-studio-project-storage';
import VoiceStudioTimelineCanvas from './voice-studio-timeline-canvas';
import { useVoiceStudioTimeline } from './use-voice-studio-timeline';
import { useVoiceStudioControllerAudioCaptureSlot } from './use-voice-studio-controller-audio-capture-slot';
import { timelinePixelsToTime, timelineSnapTime } from './voice-studio-timeline-engine';
import { VoiceStudioPlaybackEngine, playbackSelectionRange, type VoiceStudioPlaybackMode } from './voice-studio-playback-engine';
import { buildRecordedAudioAsset, commitRecordingToProject, createAudioCapture, createRecordingSession, type VoiceStudioAudioCapture, type VoiceStudioRecordingSession } from './voice-studio-recording-engine';
import {
  createSelectionState,
  deselectAllClips,
  moveFocus,
  reconcileSelection,
  selectAllClips,
  selectClipById,
  selectClipsByRect,
  selectedClipLocations,
  type VoiceStudioSelectionState,
} from './voice-studio-selection-engine';

type Status = 'idle' | 'countin' | 'recording' | 'playing';
type ArmedTrack = { kind: VoiceStudioTrackKind; instrument: string; trackId: string };
type EditMode = 'move' | 'trim-left' | 'trim-right';
type DragState = { clipId: string; trackId: string; mode: EditMode; startX: number; initialProject: VoiceStudioProject; clipIds: string[] };
type LassoState = { startX: number; startY: number; currentX: number; currentY: number };
type MidiMessageLike = { data: Uint8Array | number[] };
type MidiInputLike = { id: string; name?: string; onmidimessage: ((event: MidiMessageLike) => void) | null };
type MidiAccessLike = { inputs: Map<string, MidiInputLike>; onstatechange: (() => void) | null };
type LoadDetail = { project: VoiceStudioProject; blobs?: Record<string, Blob>; historyOperation?: VoiceStudioHistoryOperation; historyLabel?: string };

const MIN_CLIP = 0.08;
const SNAPSHOT_EVENT = 'foco-voice-studio-snapshot';
const LOAD_EVENT = 'foco-voice-studio-load-project';
const REQUEST_EVENT = 'foco-voice-studio-request-snapshot';
const INSTRUMENTS = [['piano', 'Piano'], ['electric', 'Piano elétrico'], ['organ', 'Órgão'], ['pad', 'Pad'], ['strings', 'Strings']] as const;
const EDITOR_CSS = `.vs-daw{--vs-zoom:1;--vs-track-height:92px}.vs-edit-tools{display:flex;align-items:center;gap:4px}.vs-edit-tools button{width:30px;height:30px;border:1px solid #343946;border-radius:7px;background:#1b1f28;color:#aeb4c2;display:grid;place-items:center}.vs-edit-tools button svg{width:14px}.vs-edit-tools button.active{border-color:#8b5cf6;background:#2d2151;color:#ddd6fe}.vs-edit-tools button:disabled{opacity:.35}.vs-timeline-content{position:relative;min-width:calc(100% * var(--vs-zoom));min-height:100%}.vs-timeline-content>.vs-ruler{min-width:100%}.vs-lane{position:relative;height:var(--vs-track-height)}.vs-lane .vs-clip{position:absolute;top:9px;bottom:9px;height:auto;cursor:grab;touch-action:none}.vs-lane .vs-clip:active{cursor:grabbing}.vs-clip.selected{outline:2px solid #f8fafc;outline-offset:1px;box-shadow:0 0 0 4px rgba(139,92,246,.28)}.vs-clip.locked{cursor:not-allowed;opacity:.8}.vs-track-heads article.selected{background:rgba(139,92,246,.12)}.vs-trim{display:none;position:absolute;top:0;bottom:0;width:10px;border:0;background:rgba(255,255,255,.85);z-index:6;cursor:ew-resize}.vs-clip.selected:not(.locked) .vs-trim{display:block}.vs-trim.left{left:0;border-radius:6px 0 0 6px}.vs-trim.right{right:0;border-radius:0 6px 6px 0}.vs-selection-info{margin-left:auto;color:#c4b5fd;font-size:11px}.vs-live-clip{position:absolute;top:9px;bottom:9px;height:auto}.vs-fit-tools{display:flex;align-items:center;gap:4px}.vs-fit-tools button{height:30px;border:1px solid #343946;border-radius:7px;background:#1b1f28;color:#aeb4c2;padding:0 8px;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800}.vs-fit-tools svg{width:14px}.vs-timeline{overflow:auto;overscroll-behavior:contain;cursor:crosshair}.vs-timeline:active{cursor:grabbing}.vs-timeline-content .vs-empty{inset:42px 0 0}@media(max-width:1100px){.vs-edit-tools{order:4;width:100%;justify-content:center}.vs-transport{height:auto;min-height:68px;flex-wrap:wrap;padding:8px 12px}.vs-project{min-width:130px}}`;

function timeLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${tenths}`;
}

function makePeaks(data: Float32Array, count = 180) {
  const step = Math.max(1, Math.floor(data.length / count));
  return Array.from({ length: count }, (_, index) => {
    let max = 0;
    for (let cursor = index * step; cursor < Math.min(data.length, (index + 1) * step); cursor += 1) max = Math.max(max, Math.abs(data[cursor]));
    return Math.max(0.03, max);
  });
}

function midiFrequency(note: number) { return 440 * Math.pow(2, (note - 69) / 12); }
function instrumentWave(instrument: string): OscillatorType { return instrument === 'organ' ? 'square' : instrument === 'strings' || instrument === 'pad' ? 'sawtooth' : instrument === 'electric' ? 'triangle' : 'sine'; }
function typingTarget(target: EventTarget | null) { return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable="true"]')); }
function projectHasContent(project: VoiceStudioProject) { return project.tracks.some(track => track.clips.length > 0); }

export default function VoiceStudioDaw({ readOnly }: { readOnly: boolean }) {
  const [project, setProject] = useState<VoiceStudioProject>(() => createVoiceStudioProject());
  const [status, setStatus] = useState<Status>('idle');
  const [countBeat, setCountBeat] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [meter, setMeter] = useState(0);
  const [error, setError] = useState('');
  const [trackMenu, setTrackMenu] = useState(false);
  const [armed, setArmed] = useState<ArmedTrack>({ kind: 'audio', instrument: 'piano', trackId: '' });
  const [monitorInput, setMonitorInput] = useState(false);
  const [latencyCompensationMs, setLatencyCompensationMs] = useState(45);
  const [punch, setPunch] = useState({ enabled: false, in: null as number | null, out: null as number | null });
  const [midiInputs, setMidiInputs] = useState<MidiInputLike[]>([]);
  const [midiInputId, setMidiInputId] = useState('');
  const [midiSupported, setMidiSupported] = useState(true);
  const [selection, setSelection] = useState<VoiceStudioSelectionState>(() => createSelectionState());
  const [lasso, setLasso] = useState<LassoState | null>(null);
  const [historyState, setHistoryState] = useState(() => ({ canUndo: false, canRedo: false, historyDepth: 0, futureDepth: 0 }));
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [verticalZoom, setVerticalZoom] = useState(1);

  const audioCaptureSlot =
    useVoiceStudioControllerAudioCaptureSlot();

  const captureRef = audioCaptureSlot.captureRef;
  const recorderRef = audioCaptureSlot.recorderRef;
  const chunksRef = audioCaptureSlot.chunksRef;
  const streamRef = audioCaptureSlot.streamRef;
  const analyserRef = audioCaptureSlot.analyserRef;
  const inputSourceRef = audioCaptureSlot.inputSourceRef;
  const monitorGainRef = audioCaptureSlot.monitorGainRef;
  const rafRef = audioCaptureSlot.rafRef;
  const livePeaksRef = audioCaptureSlot.livePeaksRef;

  const projectRef = useRef(project);
  const blobsRef = useRef<Record<string, Blob>>({});
  const objectUrlsRef = useRef<Record<string, string>>({});
  const clipboardRef = useRef<VoiceStudioClipboardClip | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const metroRef = useRef<number | null>(null);
  const countInTimerRef = useRef<number | null>(null);
  const playbackEngineRef = useRef<VoiceStudioPlaybackEngine | null>(null);
  const historyEngineRef = useRef(new VoiceStudioHistoryEngine(50));
  const startAtRef = useRef(0);
  const recordStartRef = useRef(0);
  const recordingSessionRef = useRef<VoiceStudioRecordingSession | null>(null);
  const activeMidiRef = useRef<Map<number, { start: number; velocity: number }>>(new Map());
  const midiNotesRef = useRef<VoiceStudioMidiNote[]>([]);
  const liveOscRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode }>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const suppressSnapshotRef = useRef(true);

  projectRef.current = project;
  const duration = Math.max(projectDuration(project), elapsed);
  const beatSeconds = 60 / project.tempo;
  const selectedIds = selection.clipIds;
  const updateTimelineView = useCallback((view: VoiceStudioProject['view']) => {
    setProject(current => ({ ...current, view: { ...current.view, ...view } }));
    setElapsed(view.playhead);
  }, []);
  const selected = useMemo(() => selectedClipLocations(project, selection), [project, selection]);
  const selectionRange = useMemo(() => playbackSelectionRange(project, selection.clipIds), [project, selection]);
  const timeline = useVoiceStudioTimeline({ duration, view: project.view, disabled: status !== 'idle', onViewChange: updateTimelineView });

  useEffect(() => {
    const receiveLoad = (event: Event) => {
      const detail = (event as CustomEvent<LoadDetail>).detail;
      if (!detail?.project) return;
      suppressSnapshotRef.current = true;
      revokeObjectUrls(objectUrlsRef.current);
      objectUrlsRef.current = createObjectUrls(detail.blobs ?? {});
      blobsRef.current = { ...(detail.blobs ?? {}) };
      const next = normalizeVoiceStudioProject(detail.project);
      if (detail.historyOperation && detail.project.id === projectRef.current.id) historyEngineRef.current.commit(projectRef.current, next, { operation: detail.historyOperation, label: detail.historyLabel });
      else historyEngineRef.current.reset();
      syncHistoryState();
      setProject(next);
      setElapsed(next.view.playhead || 0);
      setSelection(deselectAllClips());
      window.setTimeout(() => { suppressSnapshotRef.current = false; }, 0);
    };
    const requestSnapshot = () => dispatchSnapshot(projectRef.current);
    window.addEventListener(LOAD_EVENT, receiveLoad);
    window.addEventListener(REQUEST_EVENT, requestSnapshot);
    const release = window.setTimeout(() => { suppressSnapshotRef.current = false; }, 0);
    return () => {
      window.clearTimeout(release);
      window.removeEventListener(LOAD_EVENT, receiveLoad);
      window.removeEventListener(REQUEST_EVENT, requestSnapshot);
    };
  }, []);

  useEffect(() => { if (!suppressSnapshotRef.current) dispatchSnapshot(project); }, [project]);
  useEffect(() => { setSelection(current => reconcileSelection(project, current)); }, [project]);
  useEffect(() => () => cleanup(), []);
  useEffect(() => { if (status !== 'recording' && status !== 'countin') stopMetronome(); }, [status]);
  useEffect(() => { void connectMidi(); }, []);
  useEffect(() => { bindMidiInput(); return unbindMidiInput; }, [midiInputId, midiInputs, status, armed.kind, armed.instrument]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (typingTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (event.code === 'Space') { event.preventDefault(); if (status !== 'recording' && status !== 'countin') playAll(); return; }
      if (key === 'r' && !mod) { event.preventDefault(); if (status === 'recording') stopRecording(); else void beginRecord(); return; }
      if (key === 's' && !mod) { event.preventDefault(); splitSelected(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.size) { event.preventDefault(); deleteSelected(); return; }
      if (mod && key === 'c') { event.preventDefault(); copySelected(); return; }
      if (mod && key === 'v') { event.preventDefault(); pasteClipboard(); return; }
      if (mod && key === 'd') { event.preventDefault(); duplicateSelected(); return; }
      if (mod && key === 'a') { event.preventDefault(); setSelection(selectAllClips(project)); return; }
      if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return; }
      if ((mod && key === 'y') || (mod && event.shiftKey && key === 'z')) { event.preventDefault(); redo(); return; }
      if (event.key === 'Escape') setSelection(deselectAllClips());
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setSelection(current => moveFocus(project, current, 1, event.shiftKey)); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setSelection(current => moveFocus(project, current, -1, event.shiftKey)); }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [status, project, selectedIds, historyState, elapsed]);

  function dispatchSnapshot(next: VoiceStudioProject) { const assetIds = new Set(Object.keys(next.assets)); const blobs = Object.fromEntries(Object.entries(blobsRef.current).filter(([assetId]) => assetIds.has(assetId))); window.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT, { detail: { project: cloneVoiceStudioProject(next), blobs } })); }
  function syncHistoryState() { const snapshot = historyEngineRef.current.snapshot(); setHistoryState({ canUndo: snapshot.history.length > 0, canRedo: snapshot.future.length > 0, historyDepth: snapshot.history.length, futureDepth: snapshot.future.length }); }
  function quantize(value: number) { return timelineSnapTime(value, project.tempo, project.settings.snapDivision, project.settings.snapping); }
  function commit(mutator: (current: VoiceStudioProject) => VoiceStudioProject, operation: VoiceStudioHistoryOperation = 'project', label?: string, groupId?: string, merge = false) { setProject(current => { const next = mutator(current); if (next === current) return current; historyEngineRef.current.commit(current, next, { operation, label, groupId, merge }); syncHistoryState(); return next; }); }
  function patchProject(patch: Partial<VoiceStudioProject>, operation: VoiceStudioHistoryOperation = 'project') { commit(current => ({ ...cloneVoiceStudioProject(current), ...patch, updatedAt: new Date().toISOString() }), operation); }
  function patchTrack(trackId: string, patch: Partial<VoiceStudioTrack>, operation: VoiceStudioHistoryOperation = 'project') { const merge = operation === 'track-rename' || operation === 'gain' || operation === 'track-color'; commit(current => { const next = cloneVoiceStudioProject(current); const track = next.tracks.find(item => item.id === trackId); if (!track) return current; Object.assign(track, patch); next.updatedAt = new Date().toISOString(); return next; }, operation, undefined, trackId, merge); }
  function undo() { if (!historyState.canUndo || status !== 'idle') return; const previous = historyEngineRef.current.undo(project); if (!previous) return; syncHistoryState(); setProject(previous); setElapsed(previous.view.playhead); setSelection(current => reconcileSelection(previous, current)); }
  function redo() { if (!historyState.canRedo || status !== 'idle') return; const next = historyEngineRef.current.redo(project); if (!next) return; syncHistoryState(); setProject(next); setElapsed(next.view.playhead); setSelection(current => reconcileSelection(next, current)); }
  function audioContext() { contextRef.current ||= new AudioContext({ latencyHint: 'interactive' }); return contextRef.current; }
  function playbackEngine() { playbackEngineRef.current ||= new VoiceStudioPlaybackEngine({ getAudioContext: audioContext, midiFrequency, instrumentWave, onTick: (time) => { setElapsed(time); setProject(current => ({ ...current, view: { ...current.view, playhead: time } })); timeline.ensureTimeVisible(time); }, onEnded: (time, reason) => { setElapsed(time); setProject(current => ({ ...current, view: { ...current.view, playhead: time } })); if (reason !== 'loop') setStatus('idle'); } }); return playbackEngineRef.current; }
  function click(accent = false) { const context = audioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = accent ? 1320 : 930; gain.gain.setValueAtTime(0.16, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.055); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.06); }
  function startMetronome() { stopMetronome(); click(true); let beat = 1; metroRef.current = window.setInterval(() => { click(beat % project.timeSignature[0] === 0); beat += 1; }, beatSeconds * 1000); }
  function stopMetronome() { if (metroRef.current) window.clearInterval(metroRef.current); metroRef.current = null; }
  function clearPlayback(reset = false) { playbackEngineRef.current?.stop(reset); if (reset) setElapsed(0); }
  function cleanup() { if (timerRef.current) window.clearInterval(timerRef.current); if (metroRef.current) window.clearInterval(metroRef.current); if (countInTimerRef.current) window.clearInterval(countInTimerRef.current); if (rafRef.current) cancelAnimationFrame(rafRef.current); cleanupCapture(); liveOscRef.current.forEach((_, note) => stopLiveNote(note)); clearPlayback(); unbindMidiInput(); revokeObjectUrls(objectUrlsRef.current); void contextRef.current?.close().catch(() => undefined); }

  async function connectMidi() {
    const navigatorWithMidi = navigator as Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> };
    if (!navigatorWithMidi.requestMIDIAccess) { setMidiSupported(false); return; }
    try {
      const access = await navigatorWithMidi.requestMIDIAccess();
      const load = () => { const inputs = Array.from(access.inputs.values()); setMidiInputs(inputs); setMidiInputId(current => current || inputs[0]?.id || ''); };
      load();
      access.onstatechange = load;
    } catch { setError('Permita o acesso MIDI no navegador para usar o teclado.'); }
  }
  function selectedMidiInput() { return midiInputs.find(input => input.id === midiInputId); }
  function bindMidiInput() { const input = selectedMidiInput(); if (input) input.onmidimessage = handleMidiMessage; }
  function unbindMidiInput() { midiInputs.forEach(input => { if (input.onmidimessage === handleMidiMessage) input.onmidimessage = null; }); }
  function handleMidiMessage(event: MidiMessageLike) { const [command = 0, note = 0, velocity = 0] = Array.from(event.data); const type = command & 0xf0; const noteOn = type === 0x90 && velocity > 0; const noteOff = type === 0x80 || (type === 0x90 && velocity === 0); if (noteOn) { playLiveNote(note, velocity, armed.instrument); if (status === 'recording' && armed.kind === 'midi') activeMidiRef.current.set(note, { start: (performance.now() - startAtRef.current) / 1000, velocity }); } if (noteOff) { stopLiveNote(note); const active = activeMidiRef.current.get(note); if (active && status === 'recording' && armed.kind === 'midi') { midiNotesRef.current.push({ id: crypto.randomUUID(), note, velocity: active.velocity, start: active.start, duration: Math.max(0.04, (performance.now() - startAtRef.current) / 1000 - active.start) }); activeMidiRef.current.delete(note); } } }
  function playLiveNote(note: number, velocity: number, instrument: string) { const context = audioContext(); void context.resume(); stopLiveNote(note); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = instrumentWave(instrument); oscillator.frequency.value = midiFrequency(note); gain.gain.setValueAtTime(0, context.currentTime); gain.gain.linearRampToValueAtTime(Math.max(0.025, (velocity / 127) * 0.18), context.currentTime + 0.012); oscillator.connect(gain).connect(context.destination); oscillator.start(); liveOscRef.current.set(note, { osc: oscillator, gain }); }
  function stopLiveNote(note: number) { const voice = liveOscRef.current.get(note); if (!voice) return; const context = contextRef.current; if (context) { voice.gain.gain.cancelScheduledValues(context.currentTime); voice.gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.04); voice.osc.stop(context.currentTime + 0.2); } liveOscRef.current.delete(note); }

  async function countIn() { const total = project.countInBars * project.timeSignature[0]; if (total <= 0) return; setStatus('countin'); setCountBeat(1); click(true); let beat = 1; await new Promise<void>(resolve => { countInTimerRef.current = window.setInterval(() => { beat += 1; if (beat > total) { if (countInTimerRef.current) window.clearInterval(countInTimerRef.current); countInTimerRef.current = null; resolve(); return; } setCountBeat(beat); click((beat - 1) % project.timeSignature[0] === 0); }, beatSeconds * 1000); }); }
  async function beginRecord() { if (readOnly || status !== 'idle') return; setError(''); const track = armed.trackId ? project.tracks.find(item => item.id === armed.trackId) : null; if (!track || track.kind !== armed.kind) { setError('Arme uma track compatível antes de gravar.'); return; } recordStartRef.current = punch.enabled && punch.in !== null ? punch.in : (elapsed >= duration ? 0 : elapsed); setLivePeaks([]); livePeaksRef.current = []; midiNotesRef.current = []; activeMidiRef.current.clear(); recordingSessionRef.current = createRecordingSession({ trackId: track.id, kind: armed.kind, start: recordStartRef.current, latencyCompensation: latencyCompensationMs / 1000, punch }); try { await audioContext().resume(); if (armed.kind === 'audio') await prepareAudio(); else if (!selectedMidiInput()) throw new Error('Conecte e selecione um teclado MIDI.'); await countIn(); startBackingTracks(recordStartRef.current); if (armed.kind === 'audio') startAudioRecorder(); else startClock(); } catch (reason) { recordingSessionRef.current = null; setStatus('idle'); setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a gravação.'); cleanupCapture(); } }
  async function prepareAudio() { const deviceId = localStorage.getItem('foco-live-microphone-device'); const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); streamRef.current = stream; const context = audioContext(); const source = context.createMediaStreamSource(stream); const analyser = context.createAnalyser(); analyser.fftSize = 512; source.connect(analyser); inputSourceRef.current = source; analyserRef.current = analyser; if (monitorInput) { const gain = context.createGain(); gain.gain.value = 0.75; source.connect(gain).connect(context.destination); monitorGainRef.current = gain; } watchInput(); }
  function startClock() { startAtRef.current = performance.now(); setElapsed(recordStartRef.current); setStatus('recording'); if (project.metronomeDuringRecording) startMetronome(); timerRef.current = window.setInterval(() => setElapsed(recordStartRef.current + (performance.now() - startAtRef.current) / 1000), 50); }
  function startAudioRecorder() { const stream = audioCaptureSlot.streamRef.current; if (!stream) return; const capture = createAudioCapture(stream); captureRef.current = capture; recorderRef.current = capture.recorder; chunksRef.current = capture.chunks; capture.recorder.onstop = () => { void finishAudio(capture); }; capture.recorder.start(100); startClock(); }
  function watchInput() { const analyser = audioCaptureSlot.analyserRef.current; if (!analyser) return; const data = new Uint8Array(analyser.frequencyBinCount); const draw = () => { analyser.getByteTimeDomainData(data); let sum = 0; let max = 0; for (const value of data) { const normalized = Math.abs((value - 128) / 128); sum += normalized * normalized; max = Math.max(max, normalized); } setMeter(Math.min(1, Math.sqrt(sum / data.length) * 3)); if (recorderRef.current?.state === 'recording') { livePeaksRef.current.push(Math.max(0.03, max)); if (livePeaksRef.current.length > 220) livePeaksRef.current.shift(); setLivePeaks([...livePeaksRef.current]); } rafRef.current = requestAnimationFrame(draw); }; draw(); }
  function cleanupCapture() { if (timerRef.current) window.clearInterval(timerRef.current); timerRef.current = null; stopMetronome(); clearPlayback(); if (audioCaptureSlot.rafRef.current) cancelAnimationFrame(audioCaptureSlot.rafRef.current); audioCaptureSlot.rafRef.current = null; try { audioCaptureSlot.inputSourceRef.current?.disconnect(); } catch {} try { audioCaptureSlot.monitorGainRef.current?.disconnect(); } catch {} audioCaptureSlot.inputSourceRef.current = null; audioCaptureSlot.monitorGainRef.current = null; audioCaptureSlot.streamRef.current?.getTracks().forEach(track => track.stop()); audioCaptureSlot.streamRef.current = null; audioCaptureSlot.captureRef.current = null; audioCaptureSlot.recorderRef.current = null; audioCaptureSlot.chunksRef.current = []; setMeter(0); }
  function stopRecording() { if (armed.kind === 'audio' && recorderRef.current?.state === 'recording') { try { recorderRef.current.requestData(); } catch {} recorderRef.current.stop(); } else if (armed.kind === 'midi') finishMidi(); }
  function cancelRecording() { if (status !== 'recording' && status !== 'countin') return; if (countInTimerRef.current) window.clearInterval(countInTimerRef.current); countInTimerRef.current = null; const recorder = recorderRef.current; if (recorder?.state === 'recording') recorder.onstop = null; try { if (recorder?.state === 'recording') recorder.stop(); } catch {} recordingSessionRef.current = null; chunksRef.current = []; cleanupCapture(); setLivePeaks([]); livePeaksRef.current = []; setElapsed(recordStartRef.current); setStatus('idle'); }
  async function finishAudio(capture: VoiceStudioAudioCapture) { const session = recordingSessionRef.current; if (!session) { cleanupCapture(); setStatus('idle'); return; } const clipDuration = Math.max(MIN_CLIP, (performance.now() - startAtRef.current) / 1000); const blob = new Blob(capture.chunks, { type: capture.recorder.mimeType || capture.mimeType || 'audio/webm' }); let peaks = livePeaksRef.current; try { const context = new AudioContext(); const buffer = await context.decodeAudioData(await blob.arrayBuffer()); peaks = makePeaks(buffer.getChannelData(0)); await context.close().catch(() => undefined); } catch {} const asset = buildRecordedAudioAsset({ blob, duration: clipDuration, peaks, fileName: `voz-${Date.now()}.webm` }); addRecordedAsset(asset, blob, `Voz ${project.tracks.filter(track => track.kind === 'audio').length + 1}`, session); recordingSessionRef.current = null; cleanupCapture(); setElapsed(recordStartRef.current); setStatus('idle'); }
  function finishMidi() { const session = recordingSessionRef.current; if (!session) return; const clipDuration = Math.max(MIN_CLIP, (performance.now() - startAtRef.current) / 1000); activeMidiRef.current.forEach((active, note) => midiNotesRef.current.push({ id: crypto.randomUUID(), note, velocity: active.velocity, start: active.start, duration: Math.max(0.04, clipDuration - active.start) })); activeMidiRef.current.clear(); addRecordedAsset({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), kind: 'midi', duration: clipDuration, peaks: [], midiNotes: [...midiNotesRef.current], instrument: armed.instrument }, undefined, `Teclado ${project.tracks.filter(track => track.kind === 'midi').length + 1}`, session); recordingSessionRef.current = null; cleanupCapture(); setElapsed(recordStartRef.current); setStatus('idle'); }
  function addRecordedAsset(asset: VoiceStudioAsset, blob: Blob | undefined, name: string, session: VoiceStudioRecordingSession) { if (blob) { blobsRef.current[asset.id] = blob; objectUrlsRef.current[asset.id] = URL.createObjectURL(blob); } commit(current => commitRecordingToProject({ project: current, asset, clipName: name, session }).project, 'recording', 'Recording', session.id); }

  function playbackBounds(mode: VoiceStudioPlaybackMode) {
    if (mode === 'selection' && selectionRange) return selectionRange;
    if (mode === 'loop' && project.loop.enabled && project.loop.end > project.loop.start) return { start: project.loop.start, end: project.loop.end };
    return { start: elapsed >= duration ? 0 : elapsed, end: duration };
  }
  function startBackingTracks(offset: number) { void playbackEngine().play({ project, objectUrls: objectUrlsRef.current, offset, end: duration, mode: 'project', loop: false }); }
  function playAll(mode: VoiceStudioPlaybackMode = project.loop.enabled ? 'loop' : 'project') {
    if (status === 'playing') { pausePlayback(); return; }
    if (!projectHasContent(project)) return;
    const bounds = playbackBounds(mode);
    const offset = mode === 'project' ? (elapsed >= bounds.end ? 0 : elapsed) : bounds.start;
    setStatus('playing');
    void playbackEngine().play({ project, objectUrls: objectUrlsRef.current, offset, end: bounds.end, mode, loop: mode === 'loop' });
  }
  function pausePlayback() { playbackEngineRef.current?.pause(); setStatus('idle'); }
  function stopPlayback(reset = false) { playbackEngineRef.current?.stop(reset); setStatus('idle'); }
  function seekPlayhead(time: number) { const nextPlayhead = Math.max(0, Math.min(duration, quantize(time))); if (status === 'playing') stopPlayback(false); setElapsed(nextPlayhead); setProject(current => ({ ...current, view: { ...current.view, playhead: nextPlayhead } })); }

  function seekTimeline(event: React.MouseEvent<HTMLElement>) { if (status !== 'idle' || lasso || (event.target as HTMLElement).closest('.vs-clip,.vs-pro-ruler')) return; const nextPlayhead = timeline.seekAtClientX(event.clientX, quantize); seekPlayhead(nextPlayhead); setSelection(deselectAllClips()); }
  function selectClip(event: React.PointerEvent, clipId: string) { event.stopPropagation(); const mode = event.shiftKey ? 'range' : (event.ctrlKey || event.metaKey) ? 'toggle' : selectedIds.has(clipId) ? 'add' : 'replace'; setSelection(current => selectClipById(project, current, clipId, mode)); }
  function beginDrag(event: React.PointerEvent, trackId: string, clipId: string, mode: EditMode) { if (readOnly || status !== 'idle') return; const location = findClip(project, clipId); const timeline = (event.currentTarget as HTMLElement).closest('.vs-timeline') as HTMLElement | null; if (!location || location.clip.locked || !timeline) return; event.preventDefault(); event.stopPropagation(); const dragIds = selectedIds.has(clipId) ? Array.from(selectedIds) : [clipId]; if (!selectedIds.has(clipId)) setSelection(createSelectionState([clipId], clipId)); dragRef.current = { clipId, trackId, mode, startX: event.clientX, initialProject: cloneVoiceStudioProject(project), clipIds: dragIds }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  function moveDrag(event: React.PointerEvent) { const drag = dragRef.current; if (!drag) return; const location = findClip(drag.initialProject, drag.clipId); if (!location) return; const delta = timeline.timeFromClientX(event.clientX) - timeline.timeFromClientX(drag.startX); if (drag.mode === 'move') { let next = drag.initialProject; drag.clipIds.forEach(id => { const item = findClip(drag.initialProject, id); if (item && !item.clip.locked) next = moveClip(next, id, item.trackId, quantize(item.clip.start + delta)); }); setProject(next); } else if (drag.mode === 'trim-right') setProject(trimClipEnd(drag.initialProject, drag.clipId, quantize(location.clip.start + location.clip.duration + delta))); else setProject(trimClipStart(drag.initialProject, drag.clipId, quantize(location.clip.start + delta))); }
  function endDrag() { const drag = dragRef.current; if (!drag) return; dragRef.current = null; historyEngineRef.current.commit(drag.initialProject, projectRef.current, { operation: drag.mode === 'move' ? 'move' : 'trim', label: drag.mode, groupId: `${drag.mode}:${drag.clipIds.join(',')}` }); syncHistoryState(); }
  function deleteSelected() { if (readOnly || status !== 'idle' || !selectedIds.size) return; commit(current => Array.from(selectedIds).reduce((next, id) => deleteClip(next, id), current), 'delete', 'Delete clips'); setSelection(deselectAllClips()); }
  function duplicateSelected() { if (readOnly || status !== 'idle' || !selected.length) return; const offset = project.settings.snapping ? beatSeconds : 0.25; let next = project; const ids: string[] = []; selected.forEach(location => { const before = new Set(next.tracks.flatMap(track => track.clips.map(clip => clip.id))); next = duplicateClip(next, location.clip.id, location.clip.start + offset, location.trackId); const created = next.tracks.flatMap(track => track.clips).find(clip => !before.has(clip.id)); if (created) ids.push(created.id); }); if (next !== project) { historyEngineRef.current.commit(project, next, { operation: 'duplicate', label: 'Duplicate clips' }); syncHistoryState(); setProject(next); setSelection(createSelectionState(ids)); } }
  function setSelectedFade(edge: 'in' | 'out') {
    if (readOnly || status !== 'idle' || !selected.length) return;
    commit(current => selected.reduce((next, location) => updateClipFade(next, location.clip.id, edge === 'in' ? { fadeIn: Math.min(0.25, location.clip.duration / 2) } : { fadeOut: Math.min(0.25, location.clip.duration / 2) }), current), 'fade', `Fade ${edge}`);
  }
  function splitSelected() {
    if (readOnly || status !== 'idle' || !selected.length) return;
    const originals = selected.map(location => ({ assetId: location.clip.assetId, start: location.clip.start }));
    let next = project;
    selected.forEach(location => { next = splitClip(next, location.clip.id, elapsed); });
    if (next === project) return;
    const splitIds = next.tracks
      .flatMap(track => track.clips)
      .filter(clip => originals.some(original => original.assetId === clip.assetId && (Math.abs(clip.start - original.start) < 0.001 || Math.abs(clip.start - elapsed) < 0.001)))
      .map(clip => clip.id);
    historyEngineRef.current.commit(project, next, { operation: 'split', label: 'Split clips' });
    syncHistoryState();
    setProject(next);
    setSelection(createSelectionState(splitIds));
  }
  function copySelected() { if (selected.length === 1) clipboardRef.current = copyClip(project, selected[0].clip.id); }
  function pasteClipboard() { const clipboard = clipboardRef.current; if (!clipboard || readOnly || status !== 'idle') return; const targetTrackId = selected[0]?.trackId ?? clipboard.sourceTrackId; const next = pasteClip(project, clipboard, elapsed, targetTrackId); if (next === project) return; const previous = new Set(project.tracks.flatMap(track => track.clips.map(clip => clip.id))); const pasted = next.tracks.flatMap(track => track.clips).find(clip => !previous.has(clip.id)); historyEngineRef.current.commit(project, next, { operation: 'paste', label: 'Paste clip' }); syncHistoryState(); setProject(next); if (pasted) setSelection(createSelectionState([pasted.id], pasted.id)); }
  function removeTrack(trackId: string) { commit(current => { const next = cloneVoiceStudioProject(current); next.tracks = next.tracks.filter(track => track.id !== trackId); next.updatedAt = new Date().toISOString(); return next; }, 'delete', 'Remove track', trackId); setSelection(current => { const removed = new Set(project.tracks.find(track => track.id === trackId)?.clips.map(clip => clip.id) ?? []); return createSelectionState(Array.from(current.clipIds).filter(id => !removed.has(id)), current.focusClipId); }); }
  function exportAssets() { const exported = new Set<string>(); project.tracks.forEach(track => track.clips.forEach(clip => { if (exported.has(clip.assetId)) return; exported.add(clip.assetId); const asset = project.assets[clip.assetId]; if (!asset) return; if (asset.kind === 'audio') { const url = objectUrlsRef.current[asset.id]; if (url) download(url, asset.fileName || `${slug(clip.name)}.webm`); } else { const blob = createMidiFile(asset.midiNotes, project.tempo); download(URL.createObjectURL(blob), `${slug(clip.name)}.mid`, true); } })); }
  function download(url: string, name: string, revoke = false) { const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function slug(value: string) { return value.replace(/\s+/g, '-').toLowerCase(); }
  function selectTrack(kind: VoiceStudioTrackKind) { if (readOnly || status !== 'idle') return; let createdId = ''; commit(current => { const next = cloneVoiceStudioProject(current); const track = createTrackContainer({ kind, name: kind === 'audio' ? `Voz ${next.tracks.filter(item => item.kind === 'audio').length + 1}` : `Teclado ${next.tracks.filter(item => item.kind === 'midi').length + 1}`, index: next.tracks.length, instrument: kind === 'midi' ? armed.instrument : undefined }); createdId = track.id; next.tracks.push(track); next.updatedAt = new Date().toISOString(); return next; }, 'project', 'Add track'); setArmed(current => ({ ...current, kind, trackId: createdId })); setTrackMenu(false); }
  function armTrack(track: VoiceStudioTrack) { if (readOnly || status !== 'idle') return; setArmed(current => ({ ...current, kind: track.kind, trackId: current.trackId === track.id ? '' : track.id, instrument: track.instrument || current.instrument })); }

  useEffect(() => { if (status === 'playing' || status === 'recording') timeline.ensureTimeVisible(elapsed); }, [elapsed, status, timeline]);

  function beginLasso(event: React.PointerEvent<HTMLElement>) {
    if (readOnly || status !== 'idle' || event.button !== 0 || (event.target as HTMLElement).closest('.vs-clip,.vs-pro-ruler')) return;
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const startX = event.clientX - bounds.left + element.scrollLeft;
    const startY = event.clientY - bounds.top + element.scrollTop - 42;
    setLasso({ startX, startY, currentX: startX, currentY: startY });
    element.setPointerCapture(event.pointerId);
  }
  function moveLasso(event: React.PointerEvent<HTMLElement>) {
    if (!lasso) return;
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    setLasso(current => current ? { ...current, currentX: event.clientX - bounds.left + element.scrollLeft, currentY: event.clientY - bounds.top + element.scrollTop - 42 } : null);
  }
  function endLasso() {
    if (!lasso) return;
    const rect = { left: Math.min(lasso.startX, lasso.currentX), right: Math.max(lasso.startX, lasso.currentX), top: Math.max(0, Math.min(lasso.startY, lasso.currentY)), bottom: Math.max(0, Math.max(lasso.startY, lasso.currentY)) };
    setLasso(null);
    if (rect.right - rect.left < 4 && rect.bottom - rect.top < 4) return;
    setSelection(selectClipsByRect(project, rect, Math.round(74 * timeline.verticalZoom), pixels => timelinePixelsToTime(pixels, timeline.zoom)));
  }

  function fitProject() { timeline.setZoom(Math.max(0.5, timeline.viewport.width / Math.max(1, duration * 56))); }
  function fitSelection() { const start = Math.min(...selected.map(item => item.clip.start)); const end = Math.max(...selected.map(item => item.clip.start + item.clip.duration)); if (!selected.length || end <= start) return fitProject(); timeline.setZoom(Math.max(0.5, Math.min(12, timeline.viewport.width / Math.max(1, (end - start) * 56)))); window.setTimeout(() => timeline.ensureTimeVisible(start, true), 0); }

  return <div className="vs-daw" style={{ '--vs-zoom': project.view.zoom, '--vs-track-height': `${Math.round(92 * verticalZoom)}px` } as React.CSSProperties}>
    <style>{EDITOR_CSS}</style>
    <header className="vs-transport">
      <div className="vs-project"><strong>Voice Studio</strong><span>Project → Track → Clip → Asset</span></div>
      <div className="vs-tempo"><input disabled={readOnly || status !== 'idle'} value={project.tempo} min={40} max={220} type="number" onChange={event => patchProject({ tempo: Number(event.target.value) || 90 }, 'project')}/><span>BPM</span><b>{project.timeSignature[0]} / {project.timeSignature[1]}</b></div>
      <div className="vs-edit-tools"><button title="Desfazer" disabled={!historyState.canUndo || status !== 'idle'} onClick={undo}><Undo2/></button><button title="Refazer" disabled={!historyState.canRedo || status !== 'idle'} onClick={redo}><Redo2/></button><button title="Dividir clip no playhead (S)" disabled={!selected.length || status !== 'idle'} onClick={splitSelected}><Scissors/></button><button title="Duplicar clip" disabled={!selected.length || status !== 'idle'} onClick={duplicateSelected}><Copy/></button><button title="Fade in no clip" disabled={!selected.length || status !== 'idle'} onClick={() => setSelectedFade('in')}>FI</button><button title="Fade out no clip" disabled={!selected.length || status !== 'idle'} onClick={() => setSelectedFade('out')}>FO</button><button className={project.settings.snapping ? 'active' : ''} title="Snap" onClick={() => patchProject({ settings: { ...project.settings, snapping: !project.settings.snapping } }, 'project')}><Magnet/></button><button title="Reduzir zoom horizontal" onClick={() => timeline.setZoom(timeline.zoom - 0.25)}><ZoomOut/></button><button title="Aumentar zoom horizontal" onClick={() => timeline.setZoom(timeline.zoom + 0.25)}><ZoomIn/></button><button title="Reduzir zoom vertical" onClick={() => setVerticalZoom(value => Math.max(0.7, value - 0.15))}>V-</button><button title="Aumentar zoom vertical" onClick={() => setVerticalZoom(value => Math.min(1.8, value + 0.15))}>V+</button></div>
      <div className="vs-main-controls"><button onClick={() => playAll()} disabled={!projectHasContent(project) || status === 'recording' || status === 'countin'}>{status === 'playing' ? <Pause/> : <Play/>}</button><button className={status === 'recording' ? 'recording' : 'record'} onClick={status === 'recording' ? stopRecording : beginRecord} disabled={readOnly || status === 'countin' || status === 'playing' || !armed.trackId}>{status === 'recording' ? <Square/> : <Circle fill="currentColor"/>}</button><button title="Cancelar gravação" onClick={cancelRecording} disabled={status !== 'recording' && status !== 'countin'}>CANCEL</button><button title="Parar" onClick={() => stopPlayback(true)} disabled={status !== 'playing'}><Square/></button><button title="Tocar seleção" onClick={() => playAll('selection')} disabled={!selectionRange || status !== 'idle'}>SEL</button><button className={project.loop.enabled ? 'active' : ''} title="Loop" onClick={() => patchProject({ loop: { ...project.loop, enabled: !project.loop.enabled, ...(selectionRange && !project.loop.enabled ? { start: selectionRange.start, end: selectionRange.end } : {}) } }, 'loop')}>LOOP</button><time>{timeLabel(elapsed)}</time></div>
      {!readOnly && <button className="vs-export" disabled={!projectHasContent(project)} onClick={exportAssets}><Download/> Exportar</button>}
    </header>
    <section className="vs-options"><label>Contagem<select disabled={status !== 'idle' || readOnly} value={project.countInBars} onChange={event => patchProject({ countInBars: Number(event.target.value) }, 'project')}><option value={0}>Sem contagem</option><option value={1}>1 compasso</option><option value={2}>2 compassos</option></select></label><button className={project.metronomeDuringRecording ? 'active' : ''} disabled={status !== 'idle' || readOnly} onClick={() => patchProject({ metronomeDuringRecording: !project.metronomeDuringRecording }, 'project')}>Metrônomo durante a gravação</button><button className={monitorInput ? 'active' : ''} disabled={status !== 'idle' || readOnly || armed.kind !== 'audio'} onClick={() => setMonitorInput(value => !value)}>Monitor Input</button><label>Latência<input disabled={status !== 'idle' || readOnly} type="number" min={0} max={500} step={1} value={latencyCompensationMs} onChange={event => setLatencyCompensationMs(Number(event.target.value) || 0)}/><span>ms</span></label><button className={punch.enabled ? 'active' : ''} disabled={status !== 'idle' || readOnly} onClick={() => setPunch(value => ({ ...value, enabled: !value.enabled, in: value.in ?? elapsed, out: value.out ?? Math.max(elapsed + 4, project.loop.end) }))}>Punch</button>{armed.kind === 'midi' ? <><label>Teclado<select disabled={status !== 'idle' || readOnly} value={midiInputId} onChange={event => setMidiInputId(event.target.value)}><option value="">Selecione</option>{midiInputs.map(input => <option key={input.id} value={input.id}>{input.name || 'Teclado MIDI'}</option>)}</select></label><label>Timbre<select disabled={status !== 'idle' || readOnly} value={armed.instrument} onChange={event => setArmed(value => ({ ...value, instrument: event.target.value }))}>{INSTRUMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></> : <div className="vs-input"><Mic2/><span>Nível de entrada</span><i><b style={{ width: `${meter * 100}%` }}/></i></div>}{selected.length > 0 && <strong className="vs-selection-info">{selected.length} clip{selected.length > 1 ? 's' : ''} selecionado{selected.length > 1 ? 's' : ''}</strong>}<div className="vs-fit-tools"><button onClick={fitProject} title="Ajustar projeto"><Maximize2/> Projeto</button><button onClick={fitSelection} disabled={!selected.length} title="Ajustar seleção"><Focus/> Seleção</button></div>{error && <em>{error}</em>}{!midiSupported && <em>Este navegador não oferece Web MIDI.</em>}</section>
    <div className="vs-editor">
      <aside className="vs-track-heads"><div className="vs-add-wrap"><button className="vs-add" onClick={() => setTrackMenu(value => !value)} disabled={readOnly || status !== 'idle'}><Plus/> ADICIONAR FAIXA <ChevronDown/></button>{trackMenu && <div className="vs-track-menu"><button onClick={() => selectTrack('audio')}><AudioLines/><div><b>Voz / Áudio</b><small>Gravação pelo microfone</small></div></button><button disabled={!midiSupported} onClick={() => selectTrack('midi')}><KeyboardMusic/><div><b>Teclado MIDI</b><small>Notas, velocity e sustain</small></div></button></div>}</div>{project.tracks.map((track, index) => <article key={track.id} className={`${track.clips.some(clip => selectedIds.has(clip.id)) ? 'selected' : ''} ${armed.trackId === track.id ? 'armed-track' : ''}`} style={{ '--track': track.color } as React.CSSProperties}><span>{track.kind === 'midi' ? <KeyboardMusic/> : String(index + 1).padStart(2, '0')}</span><input disabled={readOnly} value={track.name} onChange={event => patchTrack(track.id, { name: event.target.value }, 'track-rename')}/><div><button className={armed.trackId === track.id ? 'recording' : ''} title="Armar track" disabled={readOnly || status !== 'idle'} onClick={() => armTrack(track)}>R</button><button className={track.muted ? 'active' : ''} disabled={readOnly} onClick={() => patchTrack(track.id, { muted: !track.muted }, 'mute')}>M</button><button className={track.solo ? 'solo' : ''} disabled={readOnly} onClick={() => patchTrack(track.id, { solo: !track.solo }, 'solo')}>S</button>{!readOnly && <button onClick={() => removeTrack(track.id)}><Trash2/></button>}</div><label><Volume2/><input disabled={readOnly} type="range" min="0" max="1" step=".05" value={track.volume} onChange={event => patchTrack(track.id, { volume: Number(event.target.value) }, 'gain')}/></label></article>)}{(status === 'recording' || status === 'countin') && <article className="armed"><span>●</span><strong>{project.tracks.find(track => track.id === armed.trackId)?.name || (armed.kind === 'midi' ? 'Track MIDI armada' : 'Track de voz armada')}</strong><small>{status === 'countin' ? 'Preparando…' : 'GRAVANDO'}</small></article>}</aside>
      <main className="vs-timeline" ref={timeline.setElement} onScroll={timeline.onScroll} onClick={seekTimeline} onPointerDown={beginLasso} onPointerMove={moveLasso} onPointerUp={endLasso} onPointerCancel={endLasso}>
        <VoiceStudioTimelineCanvas project={project} duration={duration} elapsed={elapsed} viewport={timeline.viewport} zoom={timeline.zoom} contentWidth={timeline.contentWidth} verticalZoom={timeline.verticalZoom} selectedIds={selectedIds} status={status} armedKind={armed.kind} recordStart={recordStartRef.current} livePeaks={livePeaks} readOnly={readOnly} onSeek={seekPlayhead} onBackgroundClick={seekTimeline} onSelectClip={selectClip} onBeginDrag={beginDrag} onMoveDrag={moveDrag} onEndDrag={endDrag} lasso={lasso ? { left: Math.min(lasso.startX, lasso.currentX), top: 42 + Math.min(lasso.startY, lasso.currentY), width: Math.abs(lasso.currentX - lasso.startX), height: Math.abs(lasso.currentY - lasso.startY) } : null} onBeginRecord={() => { void beginRecord(); }}/>
      </main>
    </div>
    {status === 'countin' && <div className="vs-countin"><small>ENTRADA EM</small><strong>{((countBeat - 1) % project.timeSignature[0]) + 1}</strong><div>{Array.from({ length: project.timeSignature[0] }, (_, index) => <i key={index} className={index === ((countBeat - 1) % project.timeSignature[0]) ? 'active' : ''}/>)}</div><span>Compasso {Math.ceil(countBeat / project.timeSignature[0])} de {project.countInBars}</span></div>}
  </div>;
}

function Wave({ peaks, offset = 0, duration, sourceDuration }: { peaks: number[]; offset?: number; duration?: number; sourceDuration?: number }) { const values = peaks.length ? peaks : Array.from({ length: 80 }, () => 0.04); const total = Math.max(0.01, sourceDuration || duration || 1); const start = Math.floor(offset / total * values.length); const end = Math.max(start + 1, Math.ceil((offset + (duration || total)) / total * values.length)); const visible = values.slice(start, end); return <svg className="vs-wave" viewBox={`0 0 ${Math.max(1, visible.length)} 100`} preserveAspectRatio="none">{visible.map((peak, index) => <line key={index} x1={index + 0.5} x2={index + 0.5} y1={50 - peak * 46} y2={50 + peak * 46}/>)}</svg>; }
function MidiClip({ notes, offset, duration }: { notes: VoiceStudioMidiNote[]; offset: number; duration: number }) { const visible = notes.filter(note => note.start + note.duration > offset && note.start < offset + duration); return <div className="vs-midi-notes">{visible.map(note => { const start = Math.max(0, note.start - offset); const clippedDuration = Math.min(note.start + note.duration, offset + duration) - Math.max(note.start, offset); const top = ((84 - Math.min(84, Math.max(36, note.note))) / 48) * 100; return <i key={note.id} style={{ left: `${(start / Math.max(0.1, duration)) * 100}%`, width: `${Math.max(1.2, (clippedDuration / Math.max(0.1, duration)) * 100)}%`, top: `${top}%`, opacity: 0.45 + (note.velocity / 127) * 0.55 }}/>; })}</div>; }
function variableLength(value: number) { const bytes = [value & 0x7f]; while ((value >>= 7)) bytes.unshift((value & 0x7f) | 0x80); return bytes; }
function createMidiFile(notes: VoiceStudioMidiNote[], tempo: number) { const ppq = 480; const events: Array<{ tick: number; data: number[] }> = []; notes.forEach(note => { events.push({ tick: Math.round(note.start * tempo / 60 * ppq), data: [0x90, note.note, note.velocity] }); events.push({ tick: Math.round((note.start + note.duration) * tempo / 60 * ppq), data: [0x80, note.note, 0] }); }); events.sort((a, b) => a.tick - b.tick); const track: number[] = []; let last = 0; const mpqn = Math.round(60000000 / tempo); track.push(0, 0xff, 0x51, 3, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255); events.forEach(event => { track.push(...variableLength(event.tick - last), ...event.data); last = event.tick; }); track.push(0, 0xff, 0x2f, 0); const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255]; const length = track.length; const chunk = [0x4d, 0x54, 0x72, 0x6b, (length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255, ...track]; return new Blob([new Uint8Array([...header, ...chunk])], { type: 'audio/midi' }); }
