import { describe, expect, it } from 'vitest';

import {
  buildRecordedAudioAsset,
  commitRecordingToProject,
  createRecordingSession,
  supportedRecordingMimeType,
} from './voice-studio-recording-engine';
import { createTrackContainer, createVoiceStudioProject } from './voice-studio-project-model';

describe('voice-studio-recording-engine', () => {
  it('returns an empty MIME type when MediaRecorder is unavailable', () => {
    expect(supportedRecordingMimeType()).toBe('');
  });

  it('creates a recording session with clamped start and latency', () => {
    const session = createRecordingSession({
      trackId: 'track-1',
      kind: 'audio',
      start: -3,
      latencyCompensation: -0.2,
    });

    expect(session.id).toBeTruthy();
    expect(session.trackId).toBe('track-1');
    expect(session.start).toBe(0);
    expect(session.latencyCompensation).toBe(0);
    expect(session.startedAt).toBeTypeOf('number');
    expect(session.punch).toEqual({ enabled: false, in: null, out: null });
  });

  it('preserves supplied punch settings', () => {
    const session = createRecordingSession({
      trackId: 'track-1',
      kind: 'midi',
      start: 4,
      latencyCompensation: 0.05,
      punch: { enabled: true, in: 4, out: 8 },
    });

    expect(session.punch).toEqual({ enabled: true, in: 4, out: 8 });
  });

  it('builds an audio asset with minimum duration and generated metadata', () => {
    const blob = new Blob(['audio'], { type: 'audio/ogg' });
    const asset = buildRecordedAudioAsset({ blob, duration: 0, peaks: [0.1, 0.8] });

    expect(asset.id).toBeTruthy();
    expect(asset.kind).toBe('audio');
    expect(asset.mimeType).toBe('audio/ogg');
    expect(asset.duration).toBe(0.08);
    expect(asset.fileName).toMatch(/^recording-\d+\.webm$/);
    expect(asset.createdAt).toBeTruthy();
    expect(asset.peaks).toEqual([0.1, 0.8]);
    expect(asset.midiNotes).toEqual([]);
  });

  it('uses the current fallback MIME type and explicit filename', () => {
    const asset = buildRecordedAudioAsset({
      blob: new Blob(['audio']),
      duration: 2.5,
      peaks: [],
      fileName: 'take.webm',
    });

    expect(asset.mimeType).toBe('audio/webm');
    expect(asset.fileName).toBe('take.webm');
    expect(asset.duration).toBe(2.5);
  });

  it('commits a recording with latency-compensated non-negative start', () => {
    const base = createVoiceStudioProject();
    const track = createTrackContainer({ kind: 'audio', name: 'Lead' });
    const project = { ...base, tracks: [track] };
    const asset = buildRecordedAudioAsset({ blob: new Blob(['audio'], { type: 'audio/webm' }), duration: 2, peaks: [] });
    const session = createRecordingSession({ trackId: track.id, kind: 'audio', start: 1, latencyCompensation: 0.25 });

    const result = commitRecordingToProject({ project, asset, clipName: 'Take 1', session });
    const clip = result.project.tracks[0].clips[0];

    expect(result.asset).toBe(asset);
    expect(result.clipId).toBe(clip.id);
    expect(clip.assetId).toBe(asset.id);
    expect(clip.start).toBe(0.75);
    expect(project.tracks[0].clips).toEqual([]);
  });

  it('clamps compensated recording start to zero', () => {
    const base = createVoiceStudioProject();
    const track = createTrackContainer({ kind: 'audio', name: 'Lead' });
    const asset = buildRecordedAudioAsset({ blob: new Blob(['audio']), duration: 1, peaks: [] });
    const session = createRecordingSession({ trackId: track.id, kind: 'audio', start: 0.1, latencyCompensation: 0.5 });

    const result = commitRecordingToProject({ project: { ...base, tracks: [track] }, asset, clipName: 'Take', session });
    expect(result.project.tracks[0].clips[0].start).toBe(0);
  });

  it('throws when the armed track is incompatible or missing', () => {
    const project = createVoiceStudioProject();
    const asset = buildRecordedAudioAsset({ blob: new Blob(['audio']), duration: 1, peaks: [] });
    const session = createRecordingSession({ trackId: 'missing', kind: 'audio', start: 0, latencyCompensation: 0 });

    expect(() => commitRecordingToProject({ project, asset, clipName: 'Take', session })).toThrow(
      'A gravação não pôde ser inserida na track armada.',
    );
  });
});
