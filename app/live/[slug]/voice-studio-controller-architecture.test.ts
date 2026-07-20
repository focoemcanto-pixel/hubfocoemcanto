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

  it('routes controller audio capture ref access through the slot while preserving temporary aliases', () => {
    const controller = readVoiceStudioFile('voice-studio-daw-controller.tsx');
    const unifiedRefs = [
      'captureRef',
      'recorderRef',
      'chunksRef',
      'streamRef',
      'analyserRef',
      'inputSourceRef',
      'monitorGainRef',
      'rafRef',
      'livePeaksRef',
    ];

    expect(controller).toContain('useVoiceStudioControllerAudioCaptureSlot()');

    for (const refName of unifiedRefs) {
      expect(controller).toContain(`const ${refName} = audioCaptureSlot.${refName};`);
      expect(controller).toContain(`audioCaptureSlot.${refName}.current`);
      expect(controller).not.toMatch(new RegExp(`const\\s+${refName}\\s*=\\s*useRef`));
      expect(controller).not.toMatch(new RegExp(`(?<!audioCaptureSlot\\.)${refName}\\.current`));
    }

    const controllerWithoutAliases = controller.replace(
      /\n  const (?:captureRef|recorderRef|chunksRef|streamRef|analyserRef|inputSourceRef|monitorGainRef|rafRef|livePeaksRef) = audioCaptureSlot\.(?:captureRef|recorderRef|chunksRef|streamRef|analyserRef|inputSourceRef|monitorGainRef|rafRef|livePeaksRef);/g,
      '',
    );

    for (const refName of unifiedRefs) {
      expect(controllerWithoutAliases).not.toMatch(new RegExp(`(?<![.\\w])${refName}\\b`));
    }
  });
});
