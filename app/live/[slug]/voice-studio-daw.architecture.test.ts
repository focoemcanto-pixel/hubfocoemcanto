import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./voice-studio-daw.tsx', import.meta.url)), 'utf8');

describe('VoiceStudioDaw architecture', () => {
  it('contains only provider and component composition', () => {
    expect(source.split('\n').length).toBeLessThan(40);
    expect(source).toContain('<VoiceStudioProvider readOnly={readOnly}>');
    expect(source).toContain('<Toolbar />');
    expect(source).toContain('<Timeline />');
    expect(source).toContain('<TrackArea />');
    expect(source).toContain('<Mixer />');
    expect(source).toContain('<Inspector />');
    expect(source).toContain('<BottomTransport />');
  });

  it('does not own state, effects, refs, engines or project mutation', () => {
    [
      'useState(',
      'useEffect(',
      'useRef(',
      'useCallback(',
      'VoiceStudioPlaybackEngine',
      'VoiceStudioHistoryEngine',
      'createAudioCapture',
      'commitRecordingToProject',
      'setProject(',
      'setStatus(',
      'AudioContext',
      'MediaRecorder',
    ].forEach(forbidden => expect(source).not.toContain(forbidden));
  });
});
