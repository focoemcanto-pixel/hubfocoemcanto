'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, ChevronDown, Circle, Copy, Download, KeyboardMusic, Magnet, Mic2, Pause, Play, Plus, Redo2, Scissors, Square, Trash2, Undo2, Volume2, ZoomIn, ZoomOut } from 'lucide-react';
import {
  addAssetClipToProject,
  cloneVoiceStudioProject,
  copyClip,
  createVoiceStudioProject,
  deleteClip,
  duplicateClip,
  findClip,
  moveClip,
  normalizeVoiceStudioProject,
  pasteClip,
  projectDuration,
  resizeClip,
  splitClip,
  type VoiceStudioAsset,
  type VoiceStudioClip,
  type VoiceStudioClipboardClip,
  type VoiceStudioMidiNote,
  type VoiceStudioProject,
  type VoiceStudioTrack,
  type VoiceStudioTrackKind,
} from './voice-studio-project-model';
import { createObjectUrls, revokeObjectUrls } from './voice-studio-project-storage';

type Status = 'idle' | 'countin' | 'recording' | 'playing';
type ArmedTrack = { kind: VoiceStudioTrackKind; instrument: string };
type EditMode = 'move' | 'trim-left' | 'trim-right';
type DragState = { clipId: string; trackId: string; mode: EditMode; startX: number; timelineWidth: number; initialProject: VoiceStudioProject };
type MidiMessageLike = { data: Uint8Array | number[] };
type MidiInputLike = { id: string; name?: string; onmidimessage: ((event: MidiMessageLike) => void) | null };
type MidiAccessLike = { inputs: Map<string, MidiInputLike>; onstatechange: (() => void) | null };
type LoadDetail = { project: VoiceStudioProject; blobs?: Record<string, Blob> };

const BARS = 16;
const MIN_CLIP = 0.08;
const SNAPSHOT_EVENT = 'foco-voice-studio-snapshot';
const LOAD_EVENT = 'foco-voice-studio-load-project';
const REQUEST_EVENT = 'foco-voice-studio-request-snapshot';
const INSTRUMENTS = [['piano', 'Piano'], ['electric', 'Piano elétrico'], ['organ', 'Órgão'], ['pad', 'Pad'], ['strings', 'Strings']] as const;
const EDITOR_CSS = `.vs-daw{--vs-zoom:1}.vs-edit-tools{display:flex;align-items:center;gap:4px}.vs-edit-tools button{width:30px;height:30px;border:1px solid #343946;border-radius:7px;background:#1b1f28;color:#aeb4c2;display:grid;place-items:center}.vs-edit-tools button svg{width:14px}.vs-edit-tools button.active{border-color:#8b5cf6;background:#2d2151;color:#ddd6fe}.vs-edit-tools button:disabled{opacity:.35}.vs-timeline-content{position:relative;min-width:calc(100% * var(--vs-zoom));min-height:100%}.vs-timeline-content>.vs-ruler{min-width:100%}.vs-lane{position:relative}.vs-lane .vs-clip{position:absolute;top:9px;bottom:9px;height:auto;cursor:grab;touch-action:none}.vs-lane .vs-clip:active{cursor:grabbing}.vs-clip.selected{outline:2px solid #f8fafc;outline-offset:1px;box-shadow:0 0 0 4px rgba(139,92,246,.28)}.vs-clip.locked{cursor:not-allowed;opacity:.8}.vs-track-heads article.selected{background:rgba(139,92,246,.12)}.vs-trim{display:none;position:absolute;top:0;bottom:0;width:10px;border:0;background:rgba(255,255,255,.85);z-index:6;cursor:ew-resize}.vs-clip.selected:not(.locked) .vs-trim{display:block}.vs-trim.left{left:0;border-radius:6px 0 0 6px}.vs-trim.right{right:0;border-radius:0 6px 6px 0}.vs-selection-info{margin-left:auto;color:#c4b5fd;font-size:11px}.vs-live-clip{position:absolute;top:9px;bottom:9px;height:auto}.vs-timeline-content .vs-empty{inset:42px 0 0}@media(max-width:1100px){.vs-edit-tools{order:4;width:100%;justify-content:center}.vs-transport{height:auto;min-height:68px;flex-wrap:wrap;padding:8px 12px}.vs-project{min-width:130px}}`;

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
  const [armed, setArmed] = useState<ArmedTrack>({ kind: 'audio', instrument: 'piano' });
  const [midiInputs, setMidiInputs] = useState<MidiInputLike[]>([]);
  const [midiInputId, setMidiInputId] = useState('');
  const [midiSupported, setMidiSupported] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<VoiceStudioProject[]>([]);
  const [future, setFuture] = useState<VoiceStudioProject[]>([]);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);

  const projectRef = useRef(project);
  const blobsRef = useRef<Record<string, Blob>>({});
  const objectUrlsRef = useRef<Record<string, string>>({});
  const clipboardRef = useRef<VoiceStudioClipboardClip | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const metroRef = useRef<number | null>(null);
  const countInTimerRef = useRef<number | null>(null);
  const playbackTimersRef = useRef<number[]>([]);
  const playAudiosRef = useRef<HTMLAudioElement[]>([]);
  const scheduledNodesRef = useRef<Array<OscillatorNode | GainNode>>([]);
  const startAtRef = useRef(0);
  const playbackOffsetRef = useRef(0);
  const recordStartRef = useRef(0);
  const livePeaksRef = useRef<number[]>([]);
  const activeMidiRef = useRef<Map<number, { start: number; velocity: number }>>(new Map());
  const midiNotesRef = useRef<VoiceStudioMidiNote[]>([]);
  const liveOscRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode }>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const suppressSnapshotRef = useRef(true);

  projectRef.current = project;
  const duration = Math.max(projectDuration(project), elapsed);
  const beatSeconds = 60 / project.tempo;
  const soloed = project.tracks.some(track => track.solo);
  const playhead = Math.min(100, (elapsed / duration) * 100);
  const selected = Array.from(selectedIds).map(id => findClip(project, id)).filter((value): value is NonNullable<typeof value> => Boolean(value));

  useEffect(() => {
    const receiveLoad = (event: Event) => {
      const detail = (event as CustomEvent<LoadDetail>).detail;
      if (!detail?.project) return;
      suppressSnapshotRef.current = true;
      revokeObjectUrls(objectUrlsRef.current);
      objectUrlsRef.current = createObjectUrls(detail.blobs ?? {});
      blobsRef.current = { ...(detail.blobs ?? {}) };
      const next = normalizeVoiceStudioProject(detail.project);
      setProject(next);
      setElapsed(next.view.playhead || 0);
      setHistory([]);
      setFuture([]);
      setSelectedIds(new Set());
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
      if (mod && key === 'a') { event.preventDefault(); setSelectedIds(new Set(project.tracks.flatMap(track => track.clips.map(clip => clip.id)))); return; }
      if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return; }
      if ((mod && key === 'y') || (mod && event.shiftKey && key === 'z')) { event.preventDefault(); redo(); return; }
      if (event.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [status, project, selectedIds, history, future, elapsed]);

  function dispatchSnapshot(next: VoiceStudioProject) { window.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT, { detail: { project: cloneVoiceStudioProject(next), blobs: { ...blobsRef.current } } })); }
  function quantize(value: number) { if (!project.settings.snapping) return Math.max(0, value); const unit = Math.max(0.01, beatSeconds * project.settings.snapDivision); return Math.max(0, Math.round(value / unit) * unit); }
  function commit(mutator: (current: VoiceStudioProject) => VoiceStudioProject) { setProject(current => { const next = mutator(current); if (next === current) return current; setHistory(items => [...items.slice(-49), cloneVoiceStudioProject(current)]); setFuture([]); return next; }); }
  function patchProject(patch: Partial<VoiceStudioProject>) { commit(current => ({ ...cloneVoiceStudioProject(current), ...patch, updatedAt: new Date().toISOString() })); }
  function patchTrack(trackId: string, patch: Partial<VoiceStudioTrack>) { commit(current => { const next = cloneVoiceStudioProject(current); const track = next.tracks.find(item => item.id === trackId); if (!track) return current; Object.assign(track, patch); next.updatedAt = new Date().toISOString(); return next; }); }

  function undo() { if (!history.length || status !== 'idle') return; const previous = history.at(-1)!; setHistory(items => items.slice(0, -1)); setFuture(items => [cloneVoiceStudioProject(project), ...items.slice(0, 49)]); setProject(cloneVoiceStudioProject(previous)); setElapsed(previous.view.playhead); setSelectedIds(new Set()); }
  function redo() { if (!future.length || status !== 'idle') return; const next = future[0]; setFuture(items => items.slice(1)); setHistory(items => [...items.slice(-49), cloneVoiceStudioProject(project)]); setProject(cloneVoiceStudioProject(next)); setElapsed(next.view.playhead); setSelectedIds(new Set()); }
  function audioContext() { contextRef.current ||= new AudioContext({ latencyHint: 'interactive' }); return contextRef.current; }
  function click(accent = false) { const context = audioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = accent ? 1320 : 930; gain.gain.setValueAtTime(0.16, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.055); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.06); }
  function startMetronome() { stopMetronome(); click(true); let beat = 1; metroRef.current = window.setInterval(() => { click(beat % project.timeSignature[0] === 0); beat += 1; }, beatSeconds * 1000); }
  function stopMetronome() { if (metroRef.current) window.clearInterval(metroRef.current); metroRef.current = null; }
  function clearPlayback(reset = false) { playbackTimersRef.current.forEach(id => window.clearTimeout(id)); playbackTimersRef.current = []; playAudiosRef.current.forEach(audio => { audio.pause(); audio.src = ''; }); playAudiosRef.current = []; scheduledNodesRef.current.forEach(node => { try { if ('stop' in node) (node as OscillatorNode).stop(); node.disconnect(); } catch {} }); scheduledNodesRef.current = []; if (reset) setElapsed(0); }
  function cleanup() { if (timerRef.current) window.clearInterval(timerRef.current); if (metroRef.current) window.clearInterval(metroRef.current); if (countInTimerRef.current) window.clearInterval(countInTimerRef.current); if (rafRef.current) cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(track => track.stop()); liveOscRef.current.forEach((_, note) => stopLiveNote(note)); clearPlayback(); unbindMidiInput(); revokeObjectUrls(objectUrlsRef.current); void contextRef.current?.close().catch(() => undefined); }

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
  async function beginRecord() { if (readOnly || status !== 'idle') return; setError(''); recordStartRef.current = elapsed >= duration ? 0 : elapsed; setLivePeaks([]); livePeaksRef.current = []; midiNotesRef.current = []; activeMidiRef.current.clear(); try { await audioContext().resume(); if (armed.kind === 'audio') await prepareAudio(); else if (!selectedMidiInput()) throw new Error('Conecte e selecione um teclado MIDI.'); await countIn(); startBackingTracks(recordStartRef.current); if (armed.kind === 'audio') startAudioRecorder(); else startClock(); } catch (reason) { setStatus('idle'); setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a gravação.'); cleanupCapture(); } }
  async function prepareAudio() { const deviceId = localStorage.getItem('foco-live-microphone-device'); const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); streamRef.current = stream; const context = audioContext(); const source = context.createMediaStreamSource(stream); const analyser = context.createAnalyser(); analyser.fftSize = 512; source.connect(analyser); analyserRef.current = analyser; watchInput(); }
  function startClock() { startAtRef.current = performance.now(); setElapsed(recordStartRef.current); setStatus('recording'); if (project.metronomeDuringRecording) startMetronome(); timerRef.current = window.setInterval(() => setElapsed(recordStartRef.current + (performance.now() - startAtRef.current) / 1000), 50); }
  function startAudioRecorder() { const stream = streamRef.current; if (!stream) return; const recorder = new MediaRecorder(stream); recorderRef.current = recorder; chunksRef.current = []; recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); }; recorder.onstop = () => { void finishAudio(recorder); }; recorder.start(100); startClock(); }
  function watchInput() { const analyser = analyserRef.current; if (!analyser) return; const data = new Uint8Array(analyser.frequencyBinCount); const draw = () => { analyser.getByteTimeDomainData(data); let sum = 0; let max = 0; for (const value of data) { const normalized = Math.abs((value - 128) / 128); sum += normalized * normalized; max = Math.max(max, normalized); } setMeter(Math.min(1, Math.sqrt(sum / data.length) * 3)); if (recorderRef.current?.state === 'recording') { livePeaksRef.current.push(Math.max(0.03, max)); if (livePeaksRef.current.length > 220) livePeaksRef.current.shift(); setLivePeaks([...livePeaksRef.current]); } rafRef.current = requestAnimationFrame(draw); }; draw(); }
  function cleanupCapture() { if (timerRef.current) window.clearInterval(timerRef.current); timerRef.current = null; stopMetronome(); clearPlayback(); if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; recorderRef.current = null; setMeter(0); }
  function stopRecording() { if (armed.kind === 'audio' && recorderRef.current?.state === 'recording') recorderRef.current.stop(); else if (armed.kind === 'midi') finishMidi(); }
  async function finishAudio(recorder: MediaRecorder) { const clipDuration = Math.max(MIN_CLIP, (performance.now() - startAtRef.current) / 1000); const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }); let peaks = livePeaksRef.current; try { const buffer = await audioContext().decodeAudioData(await blob.arrayBuffer()); peaks = makePeaks(buffer.getChannelData(0)); } catch {} addRecordedAsset({ kind: 'audio', duration: clipDuration, peaks, midiNotes: [], mimeType: blob.type, fileName: `voz-${Date.now()}.webm` }, blob, `Voz ${project.tracks.filter(track => track.kind === 'audio').length + 1}`); cleanupCapture(); setElapsed(recordStartRef.current); setStatus('idle'); }
  function finishMidi() { const clipDuration = Math.max(MIN_CLIP, (performance.now() - startAtRef.current) / 1000); activeMidiRef.current.forEach((active, note) => midiNotesRef.current.push({ id: crypto.randomUUID(), note, velocity: active.velocity, start: active.start, duration: Math.max(0.04, clipDuration - active.start) })); activeMidiRef.current.clear(); addRecordedAsset({ kind: 'midi', duration: clipDuration, peaks: [], midiNotes: [...midiNotesRef.current], instrument: armed.instrument }, undefined, `Teclado ${project.tracks.filter(track => track.kind === 'midi').length + 1}`); cleanupCapture(); setElapsed(recordStartRef.current); setStatus('idle'); }
  function addRecordedAsset(assetData: Omit<VoiceStudioAsset, 'id' | 'createdAt'>, blob: Blob | undefined, name: string) { const asset: VoiceStudioAsset = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...assetData }; if (blob) { blobsRef.current[asset.id] = blob; objectUrlsRef.current[asset.id] = URL.createObjectURL(blob); } commit(current => addAssetClipToProject(current, asset, name, recordStartRef.current)); }

  function playableTracks() { return project.tracks.filter(track => !track.muted && (!soloed || track.solo)); }
  function startBackingTracks(offset: number) { clearPlayback(); const context = audioContext(); playableTracks().forEach(track => track.clips.filter(clip => !clip.muted && offset < clip.start + clip.duration).forEach(clip => { const asset = project.assets[clip.assetId]; if (!asset) return; if (asset.kind === 'audio') scheduleAudioClip(track, clip, asset, offset); else scheduleMidiClip(track, clip, asset, context.currentTime, offset); })); }
  function scheduleAudioClip(track: VoiceStudioTrack, clip: VoiceStudioClip, asset: VoiceStudioAsset, offset: number) { const url = objectUrlsRef.current[asset.id]; if (!url) return; const delay = Math.max(0, clip.start - offset); const elapsedInsideClip = Math.max(0, offset - clip.start); const sourceTime = clip.sourceOffset + elapsedInsideClip; if (sourceTime >= clip.sourceOffset + clip.duration) return; const audio = new Audio(url); audio.volume = Math.min(1, Math.max(0, track.volume * clip.gain)); audio.currentTime = sourceTime; playAudiosRef.current.push(audio); const start = () => { void audio.play(); const remaining = Math.max(0.01, clip.duration - elapsedInsideClip); playbackTimersRef.current.push(window.setTimeout(() => audio.pause(), remaining * 1000)); }; if (delay > 0.005) playbackTimersRef.current.push(window.setTimeout(start, delay * 1000)); else start(); }
  function scheduleMidiClip(track: VoiceStudioTrack, clip: VoiceStudioClip, asset: VoiceStudioAsset, base: number, offset: number) { const context = audioContext(); const clipSourceEnd = clip.sourceOffset + clip.duration; asset.midiNotes.forEach(note => { const noteEnd = note.start + note.duration; if (noteEnd <= clip.sourceOffset || note.start >= clipSourceEnd) return; const globalStart = clip.start + Math.max(0, note.start - clip.sourceOffset); const globalEnd = clip.start + Math.min(clip.duration, noteEnd - clip.sourceOffset); if (globalEnd <= offset) return; const start = base + Math.max(0, globalStart - offset); const end = start + Math.max(0.01, globalEnd - Math.max(offset, globalStart)); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = instrumentWave(track.instrument ?? asset.instrument ?? 'piano'); oscillator.frequency.value = midiFrequency(note.note); gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime((note.velocity / 127) * 0.16 * track.volume * clip.gain, start + 0.01); gain.gain.setTargetAtTime(0.0001, end, 0.04); oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(end + 0.2); scheduledNodesRef.current.push(oscillator, gain); }); }
  function playAll() { if (status === 'playing') { stopPlayback(); return; } if (!projectHasContent(project)) return; const offset = elapsed >= duration ? 0 : elapsed; playbackOffsetRef.current = offset; void audioContext().resume(); startBackingTracks(offset); startAtRef.current = performance.now(); setStatus('playing'); timerRef.current = window.setInterval(() => { const next = playbackOffsetRef.current + (performance.now() - startAtRef.current) / 1000; setElapsed(next); if (next >= duration) stopPlayback(true); }, 50); }
  function stopPlayback(reset = false) { if (timerRef.current) window.clearInterval(timerRef.current); timerRef.current = null; clearPlayback(reset); setStatus('idle'); }

  function seekTimeline(event: React.MouseEvent<HTMLElement>) { if (status !== 'idle' || (event.target as HTMLElement).closest('.vs-clip')) return; const ratio = Math.min(1, Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left + event.currentTarget.scrollLeft) / event.currentTarget.scrollWidth)); const nextPlayhead = quantize(ratio * duration); setElapsed(nextPlayhead); setProject(current => ({ ...current, view: { ...current.view, playhead: nextPlayhead } })); setSelectedIds(new Set()); }
  function selectClip(event: React.PointerEvent, clipId: string) { event.stopPropagation(); if (event.ctrlKey || event.metaKey || event.shiftKey) setSelectedIds(current => { const next = new Set(current); if (next.has(clipId)) next.delete(clipId); else next.add(clipId); return next; }); else setSelectedIds(new Set([clipId])); }
  function beginDrag(event: React.PointerEvent, trackId: string, clipId: string, mode: EditMode) { if (readOnly || status !== 'idle') return; const location = findClip(project, clipId); const timeline = (event.currentTarget as HTMLElement).closest('.vs-timeline') as HTMLElement | null; if (!location || location.clip.locked || !timeline) return; event.preventDefault(); event.stopPropagation(); if (!selectedIds.has(clipId)) setSelectedIds(new Set([clipId])); dragRef.current = { clipId, trackId, mode, startX: event.clientX, timelineWidth: timeline.scrollWidth, initialProject: cloneVoiceStudioProject(project) }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  function moveDrag(event: React.PointerEvent) { const drag = dragRef.current; if (!drag) return; const location = findClip(drag.initialProject, drag.clipId); if (!location) return; const delta = (event.clientX - drag.startX) / drag.timelineWidth * duration; if (drag.mode === 'move') setProject(moveClip(drag.initialProject, drag.clipId, drag.trackId, quantize(location.clip.start + delta))); else if (drag.mode === 'trim-right') setProject(resizeClip(drag.initialProject, drag.clipId, 'right', quantize(location.clip.duration + delta))); else setProject(resizeClip(drag.initialProject, drag.clipId, 'left', quantize(location.clip.start + delta))); }
  function endDrag() { const drag = dragRef.current; if (!drag) return; dragRef.current = null; if (JSON.stringify(drag.initialProject) !== JSON.stringify(projectRef.current)) { setHistory(items => [...items.slice(-49), drag.initialProject]); setFuture([]); } }
  function deleteSelected() { if (readOnly || status !== 'idle' || !selectedIds.size) return; commit(current => Array.from(selectedIds).reduce((next, id) => deleteClip(next, id), current)); setSelectedIds(new Set()); }
  function duplicateSelected() { if (readOnly || status !== 'idle' || !selected.length) return; const offset = project.settings.snapping ? beatSeconds : 0.25; let next = project; const ids: string[] = []; selected.forEach(location => { const before = new Set(next.tracks.flatMap(track => track.clips.map(clip => clip.id))); next = duplicateClip(next, location.clip.id, location.clip.start + offset, location.trackId); const created = next.tracks.flatMap(track => track.clips).find(clip => !before.has(clip.id)); if (created) ids.push(created.id); }); if (next !== project) { setHistory(items => [...items.slice(-49), cloneVoiceStudioProject(project)]); setFuture([]); setProject(next); setSelectedIds(new Set(ids)); } }
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
    setHistory(items => [...items.slice(-49), cloneVoiceStudioProject(project)]);
    setFuture([]);
    setProject(next);
    setSelectedIds(new Set(splitIds));
  }
  function copySelected() { if (selected.length === 1) clipboardRef.current = copyClip(project, selected[0].clip.id); }
  function pasteClipboard() { const clipboard = clipboardRef.current; if (!clipboard || readOnly || status !== 'idle') return; const targetTrackId = selected[0]?.trackId ?? clipboard.sourceTrackId; const next = pasteClip(project, clipboard, elapsed, targetTrackId); if (next === project) return; const previous = new Set(project.tracks.flatMap(track => track.clips.map(clip => clip.id))); const pasted = next.tracks.flatMap(track => track.clips).find(clip => !previous.has(clip.id)); setHistory(items => [...items.slice(-49), cloneVoiceStudioProject(project)]); setFuture([]); setProject(next); if (pasted) setSelectedIds(new Set([pasted.id])); }
  function removeTrack(trackId: string) { commit(current => { const next = cloneVoiceStudioProject(current); next.tracks = next.tracks.filter(track => track.id !== trackId); next.updatedAt = new Date().toISOString(); return next; }); setSelectedIds(current => { const removed = new Set(project.tracks.find(track => track.id === trackId)?.clips.map(clip => clip.id) ?? []); return new Set(Array.from(current).filter(id => !removed.has(id))); }); }
  function exportAssets() { const exported = new Set<string>(); project.tracks.forEach(track => track.clips.forEach(clip => { if (exported.has(clip.assetId)) return; exported.add(clip.assetId); const asset = project.assets[clip.assetId]; if (!asset) return; if (asset.kind === 'audio') { const url = objectUrlsRef.current[asset.id]; if (url) download(url, asset.fileName || `${slug(clip.name)}.webm`); } else { const blob = createMidiFile(asset.midiNotes, project.tempo); download(URL.createObjectURL(blob), `${slug(clip.name)}.mid`, true); } })); }
  function download(url: string, name: string, revoke = false) { const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function slug(value: string) { return value.replace(/\s+/g, '-').toLowerCase(); }
  function selectTrack(kind: VoiceStudioTrackKind) { setArmed(current => ({ ...current, kind })); setTrackMenu(false); }

  const ruler = useMemo(() => Array.from({ length: BARS }, (_, index) => index + 1), []);

  return <div className="vs-daw" style={{ '--vs-zoom': project.view.zoom } as React.CSSProperties}>
    <style>{EDITOR_CSS}</style>
    <header className="vs-transport">
      <div className="vs-project"><strong>Voice Studio</strong><span>Project → Track → Clip → Asset</span></div>
      <div className="vs-tempo"><input disabled={readOnly || status !== 'idle'} value={project.tempo} min={40} max={220} type="number" onChange={event => patchProject({ tempo: Number(event.target.value) || 90 })}/><span>BPM</span><b>{project.timeSignature[0]} / {project.timeSignature[1]}</b></div>
      <div className="vs-edit-tools"><button title="Desfazer" disabled={!history.length || status !== 'idle'} onClick={undo}><Undo2/></button><button title="Refazer" disabled={!future.length || status !== 'idle'} onClick={redo}><Redo2/></button><button title="Dividir clip no playhead (S)" disabled={!selected.length || status !== 'idle'} onClick={splitSelected}><Scissors/></button><button title="Duplicar clip" disabled={!selected.length || status !== 'idle'} onClick={duplicateSelected}><Copy/></button><button className={project.settings.snapping ? 'active' : ''} title="Snap" onClick={() => patchProject({ settings: { ...project.settings, snapping: !project.settings.snapping } })}><Magnet/></button><button title="Reduzir zoom" onClick={() => patchProject({ view: { ...project.view, zoom: Math.max(1, project.view.zoom - 0.25) } })}><ZoomOut/></button><button title="Aumentar zoom" onClick={() => patchProject({ view: { ...project.view, zoom: Math.min(4, project.view.zoom + 0.25) } })}><ZoomIn/></button></div>
      <div className="vs-main-controls"><button onClick={playAll} disabled={!projectHasContent(project) || status === 'recording' || status === 'countin'}>{status === 'playing' ? <Pause/> : <Play/>}</button><button className={status === 'recording' ? 'recording' : 'record'} onClick={status === 'recording' ? stopRecording : beginRecord} disabled={readOnly || status === 'countin' || status === 'playing'}>{status === 'recording' ? <Square/> : <Circle fill="currentColor"/>}</button><time>{timeLabel(elapsed)}</time></div>
      {!readOnly && <button className="vs-export" disabled={!projectHasContent(project)} onClick={exportAssets}><Download/> Exportar</button>}
    </header>
    <section className="vs-options"><label>Contagem<select disabled={status !== 'idle' || readOnly} value={project.countInBars} onChange={event => patchProject({ countInBars: Number(event.target.value) })}><option value={0}>Sem contagem</option><option value={1}>1 compasso</option><option value={2}>2 compassos</option></select></label><button className={project.metronomeDuringRecording ? 'active' : ''} disabled={status !== 'idle' || readOnly} onClick={() => patchProject({ metronomeDuringRecording: !project.metronomeDuringRecording })}>Metrônomo durante a gravação</button>{armed.kind === 'midi' ? <><label>Teclado<select disabled={status !== 'idle' || readOnly} value={midiInputId} onChange={event => setMidiInputId(event.target.value)}><option value="">Selecione</option>{midiInputs.map(input => <option key={input.id} value={input.id}>{input.name || 'Teclado MIDI'}</option>)}</select></label><label>Timbre<select disabled={status !== 'idle' || readOnly} value={armed.instrument} onChange={event => setArmed(value => ({ ...value, instrument: event.target.value }))}>{INSTRUMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></> : <div className="vs-input"><Mic2/><span>Nível de entrada</span><i><b style={{ width: `${meter * 100}%` }}/></i></div>}{selected.length > 0 && <strong className="vs-selection-info">{selected.length} clip{selected.length > 1 ? 's' : ''} selecionado{selected.length > 1 ? 's' : ''}</strong>}{error && <em>{error}</em>}{!midiSupported && <em>Este navegador não oferece Web MIDI.</em>}</section>
    <div className="vs-editor">
      <aside className="vs-track-heads"><div className="vs-add-wrap"><button className="vs-add" onClick={() => setTrackMenu(value => !value)} disabled={readOnly || status !== 'idle'}><Plus/> ADICIONAR FAIXA <ChevronDown/></button>{trackMenu && <div className="vs-track-menu"><button onClick={() => selectTrack('audio')}><AudioLines/><div><b>Voz / Áudio</b><small>Gravação pelo microfone</small></div></button><button disabled={!midiSupported} onClick={() => selectTrack('midi')}><KeyboardMusic/><div><b>Teclado MIDI</b><small>Notas, velocity e sustain</small></div></button></div>}</div>{project.tracks.map((track, index) => <article key={track.id} className={track.clips.some(clip => selectedIds.has(clip.id)) ? 'selected' : ''} style={{ '--track': track.color } as React.CSSProperties}><span>{track.kind === 'midi' ? <KeyboardMusic/> : String(index + 1).padStart(2, '0')}</span><input disabled={readOnly} value={track.name} onChange={event => patchTrack(track.id, { name: event.target.value })}/><div><button className={track.muted ? 'active' : ''} disabled={readOnly} onClick={() => patchTrack(track.id, { muted: !track.muted })}>M</button><button className={track.solo ? 'solo' : ''} disabled={readOnly} onClick={() => patchTrack(track.id, { solo: !track.solo })}>S</button>{!readOnly && <button onClick={() => removeTrack(track.id)}><Trash2/></button>}</div><label><Volume2/><input disabled={readOnly} type="range" min="0" max="1" step=".05" value={track.volume} onChange={event => patchTrack(track.id, { volume: Number(event.target.value) })}/></label></article>)}{(status === 'recording' || status === 'countin') && <article className="armed"><span>●</span><strong>{armed.kind === 'midi' ? 'Nova faixa MIDI' : 'Nova voz'}</strong><small>{status === 'countin' ? 'Preparando…' : 'GRAVANDO'}</small></article>}</aside>
      <main className="vs-timeline" onClick={seekTimeline}><div className="vs-timeline-content"><div className="vs-ruler">{ruler.map(number => <span key={number}>{number}</span>)}</div><div className="vs-playhead" style={{ left: `${playhead}%` }}/>{project.tracks.map(track => <div className={`vs-lane ${track.kind}`} key={track.id}>{track.clips.map(clip => { const asset = project.assets[clip.assetId]; if (!asset) return null; return <div key={clip.id} className={`vs-clip ${selectedIds.has(clip.id) ? 'selected' : ''} ${clip.locked ? 'locked' : ''}`} onPointerDown={event => { selectClip(event, clip.id); beginDrag(event, track.id, clip.id, 'move'); }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ '--clip': clip.color || track.color, left: `${(clip.start / duration) * 100}%`, width: `${Math.max(0.8, (clip.duration / duration) * 100)}%`, opacity: clip.muted ? 0.45 : 1 } as React.CSSProperties}><button className="vs-trim left" aria-label="Aparar início" onPointerDown={event => beginDrag(event, track.id, clip.id, 'trim-left')} onPointerMove={moveDrag} onPointerUp={endDrag}/><b>{clip.name}</b>{asset.kind === 'audio' ? <Wave peaks={asset.peaks} offset={clip.sourceOffset} duration={clip.duration} sourceDuration={asset.duration}/> : <MidiClip notes={asset.midiNotes} offset={clip.sourceOffset} duration={clip.duration}/>}<button className="vs-trim right" aria-label="Aparar final" onPointerDown={event => beginDrag(event, track.id, clip.id, 'trim-right')} onPointerMove={moveDrag} onPointerUp={endDrag}/></div>; })}</div>)}{(status === 'recording' || status === 'countin') && <div className={`vs-lane live ${armed.kind}`}><div className="vs-live-clip" style={{ left: `${(recordStartRef.current / duration) * 100}%`, width: `${Math.max(1, ((elapsed - recordStartRef.current) / duration) * 100)}%` }}>{armed.kind === 'audio' ? <Wave peaks={livePeaks}/> : <div className="vs-midi-live"><KeyboardMusic/><span>Capturando MIDI…</span></div>}</div></div>}{!projectHasContent(project) && status === 'idle' && <div className="vs-empty">{armed.kind === 'midi' ? <KeyboardMusic/> : <Mic2/>}<strong>{armed.kind === 'midi' ? 'Grave seu teclado MIDI' : 'Grave a voz principal'}</strong><span>Tracks são containers. Toda gravação cria um Asset e um Clip referenciado na timeline.</span><button onClick={event => { event.stopPropagation(); void beginRecord(); }} disabled={readOnly}><Circle fill="currentColor"/> Criar primeira faixa</button></div>}</div></main>
    </div>
    {status === 'countin' && <div className="vs-countin"><small>ENTRADA EM</small><strong>{((countBeat - 1) % project.timeSignature[0]) + 1}</strong><div>{Array.from({ length: project.timeSignature[0] }, (_, index) => <i key={index} className={index === ((countBeat - 1) % project.timeSignature[0]) ? 'active' : ''}/>)}</div><span>Compasso {Math.ceil(countBeat / project.timeSignature[0])} de {project.countInBars}</span></div>}
  </div>;
}

function Wave({ peaks, offset = 0, duration, sourceDuration }: { peaks: number[]; offset?: number; duration?: number; sourceDuration?: number }) { const values = peaks.length ? peaks : Array.from({ length: 80 }, () => 0.04); const total = Math.max(0.01, sourceDuration || duration || 1); const start = Math.floor(offset / total * values.length); const end = Math.max(start + 1, Math.ceil((offset + (duration || total)) / total * values.length)); const visible = values.slice(start, end); return <svg className="vs-wave" viewBox={`0 0 ${Math.max(1, visible.length)} 100`} preserveAspectRatio="none">{visible.map((peak, index) => <line key={index} x1={index + 0.5} x2={index + 0.5} y1={50 - peak * 46} y2={50 + peak * 46}/>)}</svg>; }
function MidiClip({ notes, offset, duration }: { notes: VoiceStudioMidiNote[]; offset: number; duration: number }) { const visible = notes.filter(note => note.start + note.duration > offset && note.start < offset + duration); return <div className="vs-midi-notes">{visible.map(note => { const start = Math.max(0, note.start - offset); const clippedDuration = Math.min(note.start + note.duration, offset + duration) - Math.max(note.start, offset); const top = ((84 - Math.min(84, Math.max(36, note.note))) / 48) * 100; return <i key={note.id} style={{ left: `${(start / Math.max(0.1, duration)) * 100}%`, width: `${Math.max(1.2, (clippedDuration / Math.max(0.1, duration)) * 100)}%`, top: `${top}%`, opacity: 0.45 + (note.velocity / 127) * 0.55 }}/>; })}</div>; }
function variableLength(value: number) { const bytes = [value & 0x7f]; while ((value >>= 7)) bytes.unshift((value & 0x7f) | 0x80); return bytes; }
function createMidiFile(notes: VoiceStudioMidiNote[], tempo: number) { const ppq = 480; const events: Array<{ tick: number; data: number[] }> = []; notes.forEach(note => { events.push({ tick: Math.round(note.start * tempo / 60 * ppq), data: [0x90, note.note, note.velocity] }); events.push({ tick: Math.round((note.start + note.duration) * tempo / 60 * ppq), data: [0x80, note.note, 0] }); }); events.sort((a, b) => a.tick - b.tick); const track: number[] = []; let last = 0; const mpqn = Math.round(60000000 / tempo); track.push(0, 0xff, 0x51, 3, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255); events.forEach(event => { track.push(...variableLength(event.tick - last), ...event.data); last = event.tick; }); track.push(0, 0xff, 0x2f, 0); const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255]; const length = track.length; const chunk = [0x4d, 0x54, 0x72, 0x6b, (length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255, ...track]; return new Blob([new Uint8Array([...header, ...chunk])], { type: 'audio/midi' }); }
