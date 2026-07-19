import type {
  VoiceStudioPlayback,
  VoiceStudioPlaybackEndReason,
  VoiceStudioPlaybackRequest,
} from './voice-studio-playback';

export type VoiceStudioTransportStatus = 'idle' | 'countin' | 'recording' | 'playing';
export type VoiceStudioLoopState = { enabled: boolean; start: number; end: number };
export type VoiceStudioPunchState = { enabled: boolean; in: number | null; out: number | null };
export type VoiceStudioTransportSnapshot = {
  status: VoiceStudioTransportStatus;
  playhead: number;
  tempo: number;
  bpm: number;
  countInBars: number;
  countBeat: number;
  loop: VoiceStudioLoopState;
  punch: VoiceStudioPunchState;
};
export type CreateVoiceStudioTransportOptions = {
  playhead?: number;
  tempo?: number;
  countInBars?: number;
  loop?: Partial<VoiceStudioLoopState>;
  punch?: Partial<VoiceStudioPunchState>;
};

type TransportListener = () => void;
const clampTime = (time: number) => Math.max(0, Number.isFinite(time) ? time : 0);
const clampTempo = (tempo: number) => Math.min(220, Math.max(40, Number.isFinite(tempo) ? tempo : 90));

export class VoiceStudioTransportController {
  readonly #listeners = new Set<TransportListener>();
  #playback: VoiceStudioPlayback | null = null;
  #snapshot: VoiceStudioTransportSnapshot;

  constructor(options: CreateVoiceStudioTransportOptions = {}) {
    const tempo = clampTempo(options.tempo ?? 90);
    this.#snapshot = {
      status: 'idle',
      playhead: clampTime(options.playhead ?? 0),
      tempo,
      bpm: tempo,
      countInBars: Math.max(0, Math.floor(options.countInBars ?? 0)),
      countBeat: 0,
      loop: { enabled: options.loop?.enabled ?? false, start: clampTime(options.loop?.start ?? 0), end: clampTime(options.loop?.end ?? 0) },
      punch: { enabled: options.punch?.enabled ?? false, in: options.punch?.in == null ? null : clampTime(options.punch.in), out: options.punch?.out == null ? null : clampTime(options.punch.out) },
    };
  }

  getSnapshot = (): VoiceStudioTransportSnapshot => this.#snapshot;
  subscribe = (listener: TransportListener): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };

  attachPlayback(playback: VoiceStudioPlayback): void {
    if (this.#playback && this.#playback !== playback) throw new Error('Playback is already attached to this Transport.');
    this.#playback = playback;
  }

  async play(request: VoiceStudioPlaybackRequest): Promise<void> {
    const playback = this.#requirePlayback();
    const offset = clampTime(request.offset);
    this.#patch({ status: 'playing', playhead: offset, countBeat: 0 });
    try {
      await playback.play({ ...request, offset, loop: request.mode === 'loop' || this.#snapshot.loop.enabled });
    } catch (error) {
      this.#patch({ status: 'idle' });
      throw error;
    }
  }

  pause(): number {
    const playhead = this.#playback?.pause() ?? this.#snapshot.playhead;
    this.#patch({ status: 'idle', playhead: clampTime(playhead), countBeat: 0 });
    return this.#snapshot.playhead;
  }
  stop(reset = false): number {
    const playhead = this.#playback?.stop(reset) ?? (reset ? 0 : this.#snapshot.playhead);
    this.#patch({ status: 'idle', playhead: clampTime(playhead), countBeat: 0 });
    return this.#snapshot.playhead;
  }
  seek(time: number): number {
    if (this.#snapshot.status === 'playing') this.#playback?.stop(false);
    const playhead = clampTime(time);
    this.#patch({ status: 'idle', playhead, countBeat: 0 });
    return playhead;
  }
  setLoop(loop: Partial<VoiceStudioLoopState>): void {
    const next = { ...this.#snapshot.loop, ...loop };
    next.start = clampTime(next.start);
    next.end = Math.max(next.start, clampTime(next.end));
    this.#patch({ loop: next });
  }
  setPunch(punch: Partial<VoiceStudioPunchState>): void {
    const next = { ...this.#snapshot.punch, ...punch };
    next.in = next.in == null ? null : clampTime(next.in);
    next.out = next.out == null ? null : clampTime(next.out);
    this.#patch({ punch: next });
  }
  setCountInBars(countInBars: number): void { this.#patch({ countInBars: Math.max(0, Math.floor(countInBars)), countBeat: 0 }); }
  beginCountIn(): void { this.#patch({ status: 'countin', countBeat: 0 }); }
  setCountBeat(countBeat: number): void { this.#patch({ countBeat: Math.max(0, Math.floor(countBeat)) }); }
  beginRecording(): void { this.#patch({ status: 'recording', countBeat: 0 }); }
  endRecording(playhead = this.#snapshot.playhead): void { this.#patch({ status: 'idle', playhead: clampTime(playhead), countBeat: 0 }); }
  setTempo(tempo: number): void { const next = clampTempo(tempo); this.#patch({ tempo: next, bpm: next }); }
  setBpm(bpm: number): void { this.setTempo(bpm); }
  handlePlaybackTick(time: number): void { if (this.#snapshot.status === 'playing') this.#patch({ playhead: clampTime(time) }); }
  handlePlaybackEnded(time: number, reason: VoiceStudioPlaybackEndReason): void {
    if (reason === 'loop') { this.#patch({ status: 'playing', playhead: clampTime(time) }); return; }
    this.#patch({ status: 'idle', playhead: clampTime(time), countBeat: 0 });
  }
  dispose(): void {
    this.#playback?.stop(false);
    this.#playback = null;
    this.#listeners.clear();
    this.#snapshot = { ...this.#snapshot, status: 'idle', countBeat: 0 };
  }
  #requirePlayback(): VoiceStudioPlayback {
    if (!this.#playback) throw new Error('Playback is not attached to VoiceStudioTransportController.');
    return this.#playback;
  }
  #patch(patch: Partial<VoiceStudioTransportSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#listeners.forEach(listener => listener());
  }
}

export function createVoiceStudioTransportController(options: CreateVoiceStudioTransportOptions = {}): VoiceStudioTransportController {
  return new VoiceStudioTransportController(options);
}
