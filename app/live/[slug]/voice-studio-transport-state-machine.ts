export type VoiceStudioTransportState =
  | 'IDLE'
  | 'PLAYING'
  | 'PAUSED'
  | 'RECORDING'
  | 'COUNT_IN'
  | 'STOPPING'
  | 'SEEKING';

export type VoiceStudioTransportEvent =
  | 'PLAY'
  | 'PAUSE'
  | 'STOP'
  | 'STOPPED'
  | 'RECORD'
  | 'COUNT_IN_FINISHED'
  | 'RECORDING_FINISHED'
  | 'PLAYBACK_FINISHED'
  | 'SEEK'
  | 'SEEK_FINISHED';

export type VoiceStudioTransportTransition = {
  from: VoiceStudioTransportState;
  event: VoiceStudioTransportEvent;
  to: VoiceStudioTransportState;
};

type StateListener = (transition: VoiceStudioTransportTransition) => void;

const TRANSITIONS: Readonly<Record<VoiceStudioTransportState, Partial<Record<VoiceStudioTransportEvent, VoiceStudioTransportState>>>> = {
  IDLE: { PLAY: 'PLAYING', RECORD: 'RECORDING', SEEK: 'SEEKING', STOP: 'STOPPING' },
  PLAYING: { PAUSE: 'PAUSED', STOP: 'STOPPING', SEEK: 'SEEKING', PLAYBACK_FINISHED: 'STOPPING' },
  PAUSED: { PLAY: 'PLAYING', STOP: 'STOPPING', SEEK: 'SEEKING' },
  RECORDING: { STOP: 'STOPPING', RECORDING_FINISHED: 'STOPPING', SEEK: 'SEEKING' },
  COUNT_IN: { STOP: 'STOPPING', COUNT_IN_FINISHED: 'RECORDING', SEEK: 'SEEKING' },
  STOPPING: { STOPPED: 'IDLE' },
  SEEKING: { SEEK_FINISHED: 'IDLE', PLAY: 'PLAYING', STOP: 'STOPPING' },
};

export class VoiceStudioTransportStateMachine {
  readonly #listeners = new Set<StateListener>();
  #state: VoiceStudioTransportState;
  #resumeState: VoiceStudioTransportState = 'IDLE';

  constructor(initialState: VoiceStudioTransportState = 'IDLE') {
    this.#state = initialState;
  }

  get state(): VoiceStudioTransportState { return this.#state; }

  can(event: VoiceStudioTransportEvent): boolean {
    return Boolean(TRANSITIONS[this.#state][event]);
  }

  transition(event: VoiceStudioTransportEvent): VoiceStudioTransportTransition | null {
    const from = this.#state;
    let to = TRANSITIONS[from][event];
    if (!to) return null;

    if (event === 'SEEK') this.#resumeState = from === 'SEEKING' ? this.#resumeState : from;
    if (from === 'SEEKING' && event === 'SEEK_FINISHED') to = this.#resumeState === 'PLAYING' ? 'PLAYING' : this.#resumeState === 'PAUSED' ? 'PAUSED' : 'IDLE';

    this.#state = to;
    const transition = { from, event, to };
    this.#listeners.forEach(listener => listener(transition));
    return transition;
  }

  force(state: VoiceStudioTransportState): VoiceStudioTransportTransition | null {
    if (state === this.#state) return null;
    const transition = { from: this.#state, event: 'STOPPED' as const, to: state };
    this.#state = state;
    this.#listeners.forEach(listener => listener(transition));
    return transition;
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

export function createVoiceStudioTransportStateMachine(initialState: VoiceStudioTransportState = 'IDLE') {
  return new VoiceStudioTransportStateMachine(initialState);
}
