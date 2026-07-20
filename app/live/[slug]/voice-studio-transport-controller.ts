import type { VoiceStudioEventBus } from './voice-studio-event-bus';
import type { VoiceStudioPlaybackRequest } from './voice-studio-playback';
import {
  createVoiceStudioTransportStateMachine,
  type VoiceStudioTransportState,
  type VoiceStudioTransportStateMachine,
} from './voice-studio-transport-state-machine';

export type VoiceStudioTransportStatus = 'idle' | 'countin' | 'recording' | 'playing';
export type VoiceStudioLoopState = { enabled: boolean; start: number; end: number };
export type VoiceStudioPunchState = { enabled: boolean; in: number | null; out: number | null };
export type VoiceStudioTransportSnapshot = {
  state: VoiceStudioTransportState;
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
  eventBus: VoiceStudioEventBus;
  playhead?: number;
  tempo?: number;
  countInBars?: number;
  loop?: Partial<VoiceStudioLoopState>;
  punch?: Partial<VoiceStudioPunchState>;
};

type TransportListener = () => void;
const clampTime = (time: number) => Math.max(0, Number.isFinite(time) ? time : 0);
const clampTempo = (tempo: number) => Math.min(220, Math.max(40, Number.isFinite(tempo) ? tempo : 90));
const legacyStatus = (state: VoiceStudioTransportState): VoiceStudioTransportStatus => {
  if (state === 'PLAYING') return 'playing';
  if (state === 'RECORDING') return 'recording';
  if (state === 'COUNT_IN') return 'countin';
  return 'idle';
};

export class VoiceStudioTransportController {
  readonly #listeners = new Set<TransportListener>();
  readonly #eventBus: VoiceStudioEventBus;
  readonly #unsubscribe: Array<() => void>;
  readonly #machine: VoiceStudioTransportStateMachine;
  #snapshot: VoiceStudioTransportSnapshot;

  constructor(options: CreateVoiceStudioTransportOptions) {
    this.#eventBus = options.eventBus;
    this.#machine = createVoiceStudioTransportStateMachine();
    const tempo = clampTempo(options.tempo ?? 90);
    this.#snapshot = {
      state: this.#machine.state,
      status: legacyStatus(this.#machine.state),
      playhead: clampTime(options.playhead ?? 0),
      tempo,
      bpm: tempo,
      countInBars: Math.max(0, Math.floor(options.countInBars ?? 0)),
      countBeat: 0,
      loop: { enabled: options.loop?.enabled ?? false, start: clampTime(options.loop?.start ?? 0), end: clampTime(options.loop?.end ?? 0) },
      punch: { enabled: options.punch?.enabled ?? false, in: options.punch?.in == null ? null : clampTime(options.punch.in), out: options.punch?.out == null ? null : clampTime(options.punch.out) },
    };
    const releaseMachine = this.#machine.subscribe(({ to }) => this.#patch({ state: to, status: legacyStatus(to) }));
    this.#unsubscribe = [
      releaseMachine,
      this.#eventBus.subscribe('PLAYHEAD_CHANGED', ({ playhead }) => {
        if (this.#machine.state === 'PLAYING') this.#patch({ playhead: clampTime(playhead) });
      }),
      this.#eventBus.subscribe('PLAY_STOPPED', ({ playhead, reason }) => {
        if (reason === 'loop') {
          this.#patch({ playhead: clampTime(playhead) });
          return;
        }
        if (reason === 'pause') this.#machine.transition('PAUSE');
        else {
          if (this.#machine.state === 'PLAYING') this.#machine.transition(reason === 'ended' ? 'PLAYBACK_FINISHED' : 'STOP');
          if (this.#machine.state !== 'STOPPING') this.#machine.transition('STOP');
          this.#machine.transition('STOPPED');
        }
        this.#patch({ playhead: clampTime(playhead), countBeat: 0 });
      }),
    ];
  }

  get state(): VoiceStudioTransportState { return this.#machine.state; }
  getSnapshot = (): VoiceStudioTransportSnapshot => this.#snapshot;
  subscribe = (listener: TransportListener): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };

  async play(request: VoiceStudioPlaybackRequest): Promise<void> {
    const transition = this.#machine.transition('PLAY');
    if (!transition) return;
    const offset = clampTime(request.offset);
    this.#patch({ playhead: offset, countBeat: 0 });
    try {
      await this.#eventBus.publishAsync('PLAY_STARTED', {
        request: { ...request, offset, loop: request.mode === 'loop' || this.#snapshot.loop.enabled },
      });
    } catch (error) {
      this.#machine.transition('STOP');
      this.#machine.transition('STOPPED');
      this.#patch({ countBeat: 0 });
      throw error;
    }
  }

  pause(): number {
    if (this.#machine.state !== 'PLAYING') return this.#snapshot.playhead;
    this.#eventBus.publish('PLAY_STOPPED', { playhead: this.#snapshot.playhead, reason: 'pause' });
    return this.#snapshot.playhead;
  }

  stop(reset = false): number {
    const playhead = reset ? 0 : this.#snapshot.playhead;
    if (this.#machine.state !== 'STOPPING') this.#machine.transition('STOP');
    this.#eventBus.publish('PLAY_STOPPED', { playhead, reason: 'stop' });
    return playhead;
  }

  returnToStart(): number { return this.stop(true); }

  seek(time: number): number {
    const playhead = clampTime(time);
    const wasPlaying = this.#machine.state === 'PLAYING';
    this.#machine.transition('SEEK');
    if (wasPlaying) this.#eventBus.publish('PLAY_STOPPED', { playhead, reason: 'stop' });
    this.#patch({ playhead, countBeat: 0 });
    this.#eventBus.publish('PLAYHEAD_CHANGED', { playhead });
    if (this.#machine.state === 'SEEKING') this.#machine.transition('SEEK_FINISHED');
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
  beginCountIn(): void { this.#machine.transition('COUNT_IN'); this.#patch({ countBeat: 0 }); }
  setCountBeat(countBeat: number): void { this.#patch({ countBeat: Math.max(0, Math.floor(countBeat)) }); }
  beginRecording(): void {
    if (this.#machine.state === 'COUNT_IN') this.#machine.transition('COUNT_IN_FINISHED');
    else this.#machine.transition('RECORD');
    this.#patch({ countBeat: 0 });
  }
  endRecording(playhead = this.#snapshot.playhead): void {
    if (this.#machine.state === 'RECORDING') this.#machine.transition('RECORDING_FINISHED');
    if (this.#machine.state === 'STOPPING') this.#machine.transition('STOPPED');
    this.#patch({ playhead: clampTime(playhead), countBeat: 0 });
  }
  setTempo(tempo: number): void { const next = clampTempo(tempo); this.#patch({ tempo: next, bpm: next }); }
  setBpm(bpm: number): void { this.setTempo(bpm); }

  dispose(): void {
    this.#unsubscribe.forEach(unsubscribe => unsubscribe());
    this.#listeners.clear();
    if (this.#machine.state !== 'STOPPING') this.#machine.transition('STOP');
    if (this.#machine.state === 'STOPPING') this.#machine.transition('STOPPED');
    this.#snapshot = { ...this.#snapshot, state: 'IDLE', status: 'idle', countBeat: 0 };
  }

  #patch(patch: Partial<VoiceStudioTransportSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#listeners.forEach(listener => listener());
  }
}

export function createVoiceStudioTransportController(options: CreateVoiceStudioTransportOptions): VoiceStudioTransportController {
  return new VoiceStudioTransportController(options);
}
