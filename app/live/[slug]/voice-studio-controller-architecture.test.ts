import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const voiceStudioDir = join(process.cwd(), 'app/live/[slug]');

function readVoiceStudioFile(fileName: string) {
  return readFileSync(join(voiceStudioDir, fileName), 'utf8');
}

describe('Voice Studio controller architecture', () => {
  it('keeps the legacy DAW facade delegated to the extracted controller', () => {
    const facade = readVoiceStudioFile('voice-studio-daw.tsx');

    expect(facade).toContain("export { default } from './voice-studio-daw-controller';");
    expect(facade).not.toContain('function VoiceStudioDaw(');
  });

  it('exposes a dedicated audio recording lifecycle hook', () => {
    const hook = readVoiceStudioFile('use-voice-studio-audio-recording.ts');

    expect(hook).toContain('export type VoiceStudioAudioRecording');
    expect(hook).toContain('export function useVoiceStudioAudioRecording(');
    expect(hook).toContain('createAudioCapture(stream)');
    expect(hook).toContain('capture.recorder.onstop');
    expect(hook).toContain('requestAnimationFrame(draw)');
    expect(hook).toContain('buildRecordedAudioAsset');
  });

  it('keeps audio recording lifecycle implementation out of the controller', () => {
    const controller = readVoiceStudioFile('voice-studio-daw-controller.tsx');
    const hook = readVoiceStudioFile('use-voice-studio-audio-recording.ts');
    const movedResponsibilities = [
      'MediaRecorder',
      'createAudioCapture',
      'capture.recorder.onstop',
      'requestAnimationFrame(draw)',
      'createMediaStreamSource(stream)',
      'createAnalyser()',
      'monitorGainRef',
      'livePeaksRef',
      'buildRecordedAudioAsset',
    ];

    expect(controller).toContain('useVoiceStudioAudioRecording({');
    expect(controller).toContain('recording.prepare()');
    expect(controller).toContain('recording.begin()');
    expect(controller).toContain('recording.stop()');
    expect(controller).toContain('recording.cancel()');
    expect(controller).toContain('recording.cleanup()');

    for (const responsibility of movedResponsibilities) {
      expect(hook).toContain(responsibility);
      expect(controller).not.toContain(responsibility);
    }
  });

  it('exposes a dedicated transport lifecycle hook', () => {
    const hook = readVoiceStudioFile('use-voice-studio-transport.ts');

    expect(hook).toContain('export type VoiceStudioTransport');
    expect(hook).toContain('export function useVoiceStudioTransport(');
    expect(hook).toContain('new VoiceStudioPlaybackEngine({');
    expect(hook).toContain('playbackEngineRef');
    expect(hook).toContain('timerRef');
    expect(hook).toContain('metroRef');
    expect(hook).toContain('countInTimerRef');
    expect(hook).toContain('performance.now()');
  });

  it('keeps detailed transport implementation out of the controller', () => {
    const controller = readVoiceStudioFile('voice-studio-daw-controller.tsx');
    const hook = readVoiceStudioFile('use-voice-studio-transport.ts');
    const movedResponsibilities = [
      'new VoiceStudioPlaybackEngine({',
      'playbackEngineRef',
      'timerRef',
      'metroRef',
      'countInTimerRef',
      'const startMetronome',
      'const stopMetronome',
      'const playbackBounds',
      'const startRecordingClock',
      'const cleanupCapture',
    ];

    expect(controller).toContain('useVoiceStudioTransport({');
    expect(controller).toContain('transport.play()');
    expect(controller).toContain("transport.play('selection')");
    expect(controller).toContain('transport.stop(true)');
    expect(controller).toContain('transport.seek(time)');
    expect(controller).toContain('transport.countIn()');
    expect(controller).toContain('transport.startBackingTracks(recordStartRef.current)');
    expect(controller).toContain('transport.startRecordingClock()');
    expect(controller).toContain('transport.cleanup()');

    for (const responsibility of movedResponsibilities) {
      expect(hook).toContain(responsibility);
      expect(controller).not.toContain(responsibility);
    }
  });
});
