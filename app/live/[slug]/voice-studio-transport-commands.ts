import type { VoiceStudioPlayback, VoiceStudioPlaybackRequest } from './voice-studio-playback';
import type { BeginVoiceStudioRecordingInput, VoiceStudioRecording, VoiceStudioRecordingSession } from './voice-studio-recording';
import type { VoiceStudioTransportController } from './voice-studio-transport-controller';

export type VoiceStudioTransportCommandDependencies = {
  transport: VoiceStudioTransportController;
  playback: VoiceStudioPlayback;
  recording: VoiceStudioRecording;
};

export type VoiceStudioSpaceCommandResult = 'PLAY' | 'STOP' | 'IGNORED';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export class VoiceStudioTransportCommands {
  readonly #transport: VoiceStudioTransportController;
  readonly #playback: VoiceStudioPlayback;
  readonly #recording: VoiceStudioRecording;
  #stopGeneration = 0;

  constructor(dependencies: VoiceStudioTransportCommandDependencies) {
    this.#transport = dependencies.transport;
    this.#playback = dependencies.playback;
    this.#recording = dependencies.recording;
  }

  async play(request: VoiceStudioPlaybackRequest): Promise<void> {
    if (this.#transport.state === 'PLAYING') return;
    await this.#transport.play(request);
  }

  pause(): number {
    if (this.#transport.state !== 'PLAYING') return this.#transport.getSnapshot().playhead;
    return this.#playback.pause();
  }

  stop(): number {
    const generation = ++this.#stopGeneration;
    const state = this.#transport.state;
    const playhead = this.#playback.isPlaying
      ? this.#playback.currentTime()
      : this.#transport.getSnapshot().playhead;

    // Runtime cleanup is synchronous and intentionally happens before state/event fan-out.
    this.#playback.stop(false, 'stop', playhead, false);
    this.#transport.stop(false);

    if (generation === this.#stopGeneration && (state === 'RECORDING' || state === 'COUNT_IN')) {
      this.#recording.cancel(playhead);
    }

    return playhead;
  }

  returnToStart(): number {
    this.stop();
    return this.#transport.returnToStart();
  }

  record(input: BeginVoiceStudioRecordingInput): Promise<VoiceStudioRecordingSession> {
    return this.#recording.begin(input);
  }

  async space(request: VoiceStudioPlaybackRequest): Promise<VoiceStudioSpaceCommandResult> {
    if (this.#transport.state === 'IDLE') {
      await this.play(request);
      return 'PLAY';
    }

    this.stop();
    return 'STOP';
  }

  async handleKeyDown(event: KeyboardEvent, request: VoiceStudioPlaybackRequest): Promise<VoiceStudioSpaceCommandResult> {
    if (event.code !== 'Space' || event.repeat || event.defaultPrevented || isEditableTarget(event.target)) return 'IGNORED';
    event.preventDefault();
    return this.space(request);
  }
}

export function createVoiceStudioTransportCommands(dependencies: VoiceStudioTransportCommandDependencies) {
  return new VoiceStudioTransportCommands(dependencies);
}
