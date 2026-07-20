import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(__dirname, 'voice-studio-browser-recording-adapter.ts'), 'utf8');

describe('Voice Studio browser recording adapter architecture', () => {
  it('owns browser audio permission and MediaRecorder lifecycle', () => {
    expect(source).toContain('getUserMedia');
    expect(source).toContain('createAudioCapture(stream)');
    expect(source).toContain('capture.recorder.start()');
    expect(source).toContain('capture.recorder.stop()');
  });

  it('stops browser tracks on failure, stop, cancel and dispose', () => {
    expect(source).toContain('stream.getTracks().forEach(track => track.stop())');
    expect(source).toContain('async stop()');
    expect(source).toContain('async cancel()');
    expect(source).toContain('async dispose()');
  });

  it('returns one browser-neutral recording result', () => {
    expect(source).toContain('VoiceStudioBrowserRecordingResult');
    expect(source).toContain('blob: new Blob(capture.chunks');
    expect(source).toContain('mimeType:');
  });
});
