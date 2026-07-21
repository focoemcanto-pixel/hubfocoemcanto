import type { VoiceStudioAsset, VoiceStudioClip, VoiceStudioProject, VoiceStudioTrack } from './voice-studio-project-model';

export type VoiceStudioPlaybackMode = 'project' | 'loop' | 'selection';
export type VoiceStudioPlaybackEndReason = 'stop' | 'pause' | 'ended' | 'loop';

export type VoiceStudioPlaybackSnapshot = {
  project: VoiceStudioProject;
  objectUrls: Record<string, string>;
  offset: number;
  end: number;
  mode: VoiceStudioPlaybackMode;
  loop: boolean;
};

export type VoiceStudioPlaybackCallbacks = {
  getAudioContext: () => AudioContext;
  onTick: (time: number, drift: number) => void;
  onEnded: (time: number, reason: VoiceStudioPlaybackEndReason) => void;
  midiFrequency: (note: number) => number;
  instrumentWave: (instrument: string) => OscillatorType;
};

type ScheduledAudio = { audio: HTMLAudioElement; gain: GainNode; source: MediaElementAudioSourceNode; timer: number | null; timelineStart: number; sourceStart: number };
type ScheduledNode = AudioScheduledSourceNode | AudioNode;

const LOOKAHEAD_SECONDS = 0.16;
const TIMER_INTERVAL_MS = 25;
const START_LATENCY_SECONDS = 0.045;
const DRIFT_RESYNC_SECONDS = 0.045;
const FADE_FLOOR = 0.0001;

function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
function audibleTracks(project: VoiceStudioProject) { const soloed = project.tracks.some(track => track.solo); return project.tracks.filter(track => !track.muted && (!soloed || track.solo)); }
function clipEnd(clip: VoiceStudioClip) { return clip.start + clip.duration; }
function clipIntersects(clip: VoiceStudioClip, start: number, end: number) { return clipEnd(clip) > start && clip.start < end; }
function clipBaseGain(track: VoiceStudioTrack, clip: VoiceStudioClip) { return clamp(track.volume * clip.gain, 0, 1); }
function gainAtClipTime(clip: VoiceStudioClip, baseGain: number, localTime: number) {
  const fadeInGain = clip.fadeIn > 0 ? clamp(localTime / clip.fadeIn, 0, 1) : 1;
  const fadeOutStart = Math.max(0, clip.duration - clip.fadeOut);
  const fadeOutGain = clip.fadeOut > 0 && localTime >= fadeOutStart ? clamp((clip.duration - localTime) / clip.fadeOut, 0, 1) : 1;
  return baseGain * Math.min(fadeInGain, fadeOutGain);
}

export function playbackProjectRange(project: VoiceStudioProject) {
  const clips = project.tracks.flatMap(track => track.clips);
  if (!clips.length) return null;
  return { start: Math.min(...clips.map(clip => clip.start)), end: Math.max(...clips.map(clipEnd)) };
}

export function playbackSelectionRange(project: VoiceStudioProject, clipIds: Iterable<string>) {
  const selected = new Set(clipIds);
  const clips = project.tracks.flatMap(track => track.clips.filter(clip => selected.has(clip.id)));
  if (!clips.length) return null;
  return { start: Math.min(...clips.map(clip => clip.start)), end: Math.max(...clips.map(clipEnd)) };
}

export class VoiceStudioPlaybackEngine {
  private callbacks: VoiceStudioPlaybackCallbacks;
  private snapshot: VoiceStudioPlaybackSnapshot | null = null;
  private timer: number | null = null;
  private raf: number | null = null;
  private scheduledKeys = new Set<string>();
  private audios: ScheduledAudio[] = [];
  private nodes: ScheduledNode[] = [];
  private contextStartedAt = 0;
  private timelineStartedAt = 0;
  private scheduleUntil = 0;
  private stopped = true;

  constructor(callbacks: VoiceStudioPlaybackCallbacks) { this.callbacks = callbacks; }

  get isPlaying() { return !this.stopped && Boolean(this.snapshot); }

  async play(snapshot: VoiceStudioPlaybackSnapshot) {
    this.stop(false, 'stop');
    const context = this.callbacks.getAudioContext();
    await context.resume().catch(() => undefined);
    this.snapshot = { ...snapshot, offset: Math.max(0, snapshot.offset), end: Math.max(snapshot.offset, snapshot.end) };
    this.stopped = false;
    this.contextStartedAt = context.currentTime + START_LATENCY_SECONDS;
    this.timelineStartedAt = this.snapshot.offset;
    this.scheduleUntil = this.snapshot.offset;
    this.scheduleWindow();
    this.timer = window.setInterval(() => this.scheduleWindow(), TIMER_INTERVAL_MS);
    this.startTickLoop();
  }

  pause() { return this.stop(false, 'pause'); }
  stop(reset = false, reason: VoiceStudioPlaybackEndReason = 'stop') {
    const time = reset ? 0 : this.currentTime();
    this.stopped = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.timer = null; this.raf = null;
    this.clearScheduled();
    this.snapshot = null;
    this.callbacks.onEnded(time, reason);
    return time;
  }

  currentTime() {
    const context = this.callbacks.getAudioContext();
    if (!this.snapshot || this.stopped) return this.timelineStartedAt;
    return Math.max(0, this.timelineStartedAt + (context.currentTime - this.contextStartedAt));
  }

  private startTickLoop() {
    const tick = () => {
      if (this.stopped || !this.snapshot) return;
      const now = this.currentTime();
      const drift = this.correctHtmlAudioDrift(now);
      this.callbacks.onTick(now, drift);
      if (now >= this.snapshot.end) {
        if (this.snapshot.loop) { this.callbacks.onEnded(this.snapshot.offset, 'loop'); void this.play({ ...this.snapshot, offset: this.snapshot.offset }); return; }
        this.stop(false, 'ended'); return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private scheduleWindow() {
    if (!this.snapshot || this.stopped) return;
    const from = Math.max(this.snapshot.offset, this.currentTime() - 0.01);
    const until = Math.min(this.snapshot.end, Math.max(this.scheduleUntil, from) + LOOKAHEAD_SECONDS);
    audibleTracks(this.snapshot.project).forEach(track => track.clips.forEach(clip => {
      if (clip.muted || !clipIntersects(clip, from, until)) return;
      const asset = this.snapshot?.project.assets[clip.assetId];
      if (!asset) return;
      if (asset.kind === 'audio') {
        const key = `audio:${clip.id}`;
        if (this.scheduledKeys.has(key)) return;
        this.scheduledKeys.add(key);
        this.scheduleAudio(track, clip, asset, Math.max(clip.start, from));
      } else this.scheduleMidi(track, clip, asset, Math.max(clip.start, from), until);
    }));
    this.scheduleUntil = until;
  }

  private contextTimeFor(timelineTime: number) { return this.contextStartedAt + (timelineTime - this.timelineStartedAt); }

  private scheduleAudio(track: VoiceStudioTrack, clip: VoiceStudioClip, asset: VoiceStudioAsset, startTime: number) {
    if (!this.snapshot) return;
    const url = this.snapshot.objectUrls[asset.id];
    if (!url) return;
    const local = clamp(startTime - clip.start, 0, clip.duration);
    const sourceTime = clip.sourceOffset + local;
    const remaining = Math.min(clip.duration - local, this.snapshot.end - startTime, Math.max(0, asset.duration - sourceTime));
    if (remaining <= 0.005) return;
    const context = this.callbacks.getAudioContext();
    const audio = new Audio(url);
    audio.preload = 'auto'; audio.currentTime = sourceTime; audio.volume = 1; audio.playbackRate = 1;
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    const baseGain = clipBaseGain(track, clip);
    const when = this.contextTimeFor(startTime);
    gain.gain.setValueAtTime(gainAtClipTime(clip, baseGain, local), Math.max(context.currentTime, when));
    if (clip.fadeIn > local) gain.gain.linearRampToValueAtTime(baseGain, when + (clip.fadeIn - local));
    if (clip.fadeOut > 0) { const fadeStart = when + Math.max(0, clip.duration - clip.fadeOut - local); gain.gain.setValueAtTime(baseGain, fadeStart); gain.gain.linearRampToValueAtTime(FADE_FLOOR, fadeStart + clip.fadeOut); }
    source.connect(gain).connect(context.destination);
    const timer = window.setTimeout(() => { void audio.play().catch(() => undefined); }, Math.max(0, (when - context.currentTime) * 1000));
    this.audios.push({ audio, gain, source, timer, timelineStart: startTime, sourceStart: sourceTime });
    window.setTimeout(() => this.disposeAudio(audio), Math.max(20, (when - context.currentTime + remaining + 0.08) * 1000));
  }

  private scheduleMidi(track: VoiceStudioTrack, clip: VoiceStudioClip, asset: VoiceStudioAsset, from: number, until: number) {
    const context = this.callbacks.getAudioContext();
    const clipSourceEnd = clip.sourceOffset + clip.duration;
    asset.midiNotes.forEach(note => {
      const noteEnd = note.start + note.duration;
      if (noteEnd <= clip.sourceOffset || note.start >= clipSourceEnd) return;
      const globalStart = clip.start + Math.max(0, note.start - clip.sourceOffset);
      const globalEnd = clip.start + Math.min(clip.duration, noteEnd - clip.sourceOffset);
      if (globalEnd <= from || globalStart >= until) return;
      const playStart = Math.max(globalStart, from);
      const key = `midi:${clip.id}:${note.id}:${playStart.toFixed(3)}`;
      if (this.scheduledKeys.has(key)) return;
      this.scheduledKeys.add(key);
      const when = this.contextTimeFor(playStart);
      const end = this.contextTimeFor(globalEnd);
      const osc = context.createOscillator(); const gain = context.createGain();
      osc.type = this.callbacks.instrumentWave(track.instrument ?? asset.instrument ?? 'piano');
      osc.frequency.value = this.callbacks.midiFrequency(note.note);
      const local = Math.max(0, playStart - clip.start);
      const baseGain = (note.velocity / 127) * 0.16 * clipBaseGain(track, clip);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(gainAtClipTime(clip, baseGain, local), when + 0.01);
      gain.gain.setTargetAtTime(FADE_FLOOR, end, 0.035);
      osc.connect(gain).connect(context.destination); osc.start(when); osc.stop(end + 0.12);
      this.nodes.push(osc, gain);
    });
  }

  private correctHtmlAudioDrift(timelineTime: number) {
    let maxDrift = 0;
    this.audios.forEach(item => {
      const expected = item.sourceStart + Math.max(0, timelineTime - item.timelineStart);
      const drift = item.audio.currentTime - expected;
      maxDrift = Math.max(maxDrift, Math.abs(drift));
      if (Math.abs(drift) > DRIFT_RESYNC_SECONDS && !item.audio.paused) item.audio.playbackRate = clamp(1 - drift * 0.08, 0.985, 1.015);
      else item.audio.playbackRate = 1;
    });
    return maxDrift;
  }

  private disposeAudio(audio: HTMLAudioElement) {
    const item = this.audios.find(entry => entry.audio === audio); if (!item) return;
    if (item.timer !== null) window.clearTimeout(item.timer);
    item.audio.pause(); item.audio.removeAttribute('src'); item.audio.load();
    try { item.source.disconnect(); item.gain.disconnect(); } catch {}
    this.audios = this.audios.filter(entry => entry !== item);
  }

  private clearScheduled() {
    this.audios.slice().forEach(item => this.disposeAudio(item.audio));
    this.nodes.forEach(node => { try { if ('stop' in node) (node as AudioScheduledSourceNode).stop(); } catch {} try { node.disconnect(); } catch {} });
    this.nodes = []; this.scheduledKeys.clear(); this.scheduleUntil = 0;
  }
}
