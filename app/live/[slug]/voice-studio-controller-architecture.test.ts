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

  it('exposes a typed and stable audio capture slot hook for the controller', () => {
    const slot = readVoiceStudioFile('use-voice-studio-controller-audio-capture-slot.ts');

    expect(slot).toContain('export type VoiceStudioControllerAudioCaptureSlot');
    expect(slot).toContain('VoiceStudioAudioCapture');
    expect(slot).toContain('export function useVoiceStudioControllerAudioCaptureSlot()');
    expect(slot).toContain('useMemo(() => ({');
  });
});
