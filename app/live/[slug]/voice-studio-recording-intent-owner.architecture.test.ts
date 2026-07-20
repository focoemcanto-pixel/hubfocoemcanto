import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const transportSource = readFileSync(join(root, 'app/live/[slug]/voice-studio-session-transport.tsx'), 'utf8');
const hookSource = readFileSync(join(root, 'app/live/[slug]/use-voice-studio-legacy-recording-intent.ts'), 'utf8');
const bridgeSource = readFileSync(join(root, 'app/live/[slug]/voice-studio-legacy-recording-intent-bridge.ts'), 'utf8');

describe('Voice Studio recording intent ownership', () => {
  it('renders the visible Record control from the Session transport', () => {
    expect(transportSource).toContain('useVoiceStudioLegacyRecordingIntent');
    expect(transportSource).toContain("title={recording.isRecording ? 'Parar gravação' : 'Gravar'}");
    expect(transportSource).toContain('onClick={recording.trigger}');
  });

  it('owns the R shortcut before the legacy controller', () => {
    expect(transportSource).toContain("event.key.toLowerCase() !== 'r'");
    expect(transportSource).toContain('event.stopImmediatePropagation()');
    expect(transportSource).toContain('recording.trigger()');
  });

  it('delegates capture to the existing legacy button during the transition', () => {
    expect(bridgeSource).toContain(".vs-main-controls button.record");
    expect(bridgeSource).toContain('button.click()');
    expect(bridgeSource).not.toContain('MediaRecorder');
    expect(bridgeSource).not.toContain('getUserMedia');
  });

  it('mirrors count-in and recording state into the Session transport', () => {
    expect(hookSource).toContain('session.transport.beginCountIn()');
    expect(hookSource).toContain('session.transport.beginRecording()');
    expect(hookSource).toContain('session.transport.endRecording');
  });

  it('does not read document during render', () => {
    expect(hookSource).toContain("canTrigger: !readOnly && state !== 'countin'");
    expect(hookSource).not.toContain('getVoiceStudioLegacyRecordingVisualState()');
  });
});
