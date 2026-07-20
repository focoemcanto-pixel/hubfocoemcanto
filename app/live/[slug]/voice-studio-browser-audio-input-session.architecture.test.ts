import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/live/[slug]/voice-studio-browser-audio-input-session.ts'), 'utf8');

describe('Voice Studio browser audio input session architecture', () => {
  it('composes the browser recording adapter instead of creating MediaRecorder directly', () => {
    expect(source).toContain('createVoiceStudioBrowserRecordingAdapter');
    expect(source).not.toContain('new MediaRecorder');
    expect(source).not.toContain('getUserMedia(');
  });

  it('owns analyser, monitoring and continuous input frames', () => {
    expect(source).toContain('createMediaStreamSource');
    expect(source).toContain('createAnalyser');
    expect(source).toContain('createGain');
    expect(source).toContain('requestAnimationFrame(draw)');
    expect(source).toContain('onFrame?.');
  });

  it('cleans the graph on stop, cancel and dispose', () => {
    expect(source).toContain('disposeGraph();');
    expect(source).toContain('cancelAnimationFrame');
    expect(source).toContain('source.disconnect()');
    expect(source).toContain('monitor?.disconnect()');
  });
});
