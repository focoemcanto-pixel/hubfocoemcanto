import { describe, expect, it } from 'vitest';
import { createTrackContainer, createVoiceStudioProject, type VoiceStudioAsset } from './voice-studio-project-model';
import { createVoiceStudioSession } from './voice-studio-session';
import { createVoiceStudioTimelineViewModel, voiceStudioTimelineDuration } from './voice-studio-timeline-view-model';

function projectFixture() {
  const project = createVoiceStudioProject('Timeline View');
  const track = createTrackContainer({ kind: 'audio', name: 'Voz' });
  const asset: VoiceStudioAsset = {
    id: 'asset-view',
    kind: 'audio',
    duration: 10,
    createdAt: '2026-07-19T00:00:00.000Z',
    peaks: [0.1, 0.5],
    midiNotes: [],
  };
  project.assets[asset.id] = asset;
  track.clips.push({
    id: 'clip-view',
    assetId: asset.id,
    name: 'Take',
    start: 4,
    sourceOffset: 0,
    duration: 6,
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
    muted: false,
    locked: false,
  });
  project.tracks.push(track);
  project.view.playhead = 3;
  return project;
}

describe('VoiceStudioTimelineViewModel', () => {
  it('derives render state from Session without owning transport lifecycle', () => {
    const project = projectFixture();
    const session = createVoiceStudioSession({ project });
    const model = createVoiceStudioTimelineViewModel(session);

    expect(model.project).toBe(session.project);
    expect(model.playhead).toBe(3);
    expect(model.status).toBe('idle');
    expect(model.duration).toBe(10);
  });

  it('calculates duration from clips while preserving the minimum canvas length', () => {
    expect(voiceStudioTimelineDuration(createVoiceStudioProject())).toBe(8);
    expect(voiceStudioTimelineDuration(projectFixture())).toBe(10);
  });
});
