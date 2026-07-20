import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lifecycle = readFileSync(new URL('./voice-studio-recording-capture-lifecycle.ts', import.meta.url), 'utf8');
const session = readFileSync(new URL('./voice-studio-session.ts', import.meta.url), 'utf8');
const types = readFileSync(new URL('./voice-studio-session-types.ts', import.meta.url), 'utf8');

describe('recording capture lifecycle architecture', () => {
  it('belongs to the Session composition root', () => {
    expect(session).toContain('createVoiceStudioRecordingCaptureLifecycle');
    expect(session).toContain('recordingCapture');
    expect(types).toContain('recordingCapture: VoiceStudioRecordingCaptureLifecycle');
  });

  it('owns cleanup without importing UI or project mutation concerns', () => {
    expect(lifecycle).toContain('handle.stop()');
    expect(lifecycle).toContain('handle?.cancel()');
    expect(lifecycle).toContain('handle.dispose?.()');
    expect(lifecycle).not.toContain("from 'react'");
    expect(lifecycle).not.toContain('document.');
    expect(lifecycle).not.toContain('addAssetClipToProject');
  });

  it('protects against overlapping or late capture starts', () => {
    expect(lifecycle).toContain("this.#snapshot.state !== 'idle'");
    expect(lifecycle).toContain('generation !== this.#generation');
    expect(lifecycle).toContain('await handle.dispose?.()');
  });
});
