import type { VoiceStudioProject } from './voice-studio-project-model';
import type { VoiceStudioSession } from './voice-studio-session-types';
import type { VoiceStudioTransportStatus } from './voice-studio-transport-controller';

export type VoiceStudioTimelineViewModel = {
  project: VoiceStudioProject;
  playhead: number;
  status: VoiceStudioTransportStatus;
  duration: number;
};

export function voiceStudioTimelineDuration(project: VoiceStudioProject): number {
  return Math.max(
    8,
    ...project.tracks.flatMap(track => track.clips.map(clip => clip.start + clip.duration)),
  );
}

export function createVoiceStudioTimelineViewModel(session: VoiceStudioSession): VoiceStudioTimelineViewModel {
  const transport = session.transport.getSnapshot();
  return {
    project: session.project,
    playhead: transport.playhead,
    status: transport.status,
    duration: voiceStudioTimelineDuration(session.project),
  };
}
