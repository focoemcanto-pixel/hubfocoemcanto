import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'app/live/[slug]');

function source(file: string) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

describe('recording playhead migration architecture', () => {
  it('publishes legacy recording time through the Session EventBus', () => {
    const bridge = source('use-voice-studio-legacy-recording-playhead-bridge.ts');
    expect(bridge).toContain("session.eventBus.publish('PLAYHEAD_CHANGED'");
    expect(bridge).toContain("status !== 'recording'");
    expect(bridge).toContain('requestAnimationFrame');
    expect(bridge).toContain('cancelAnimationFrame');
  });

  it('uses Session playhead for cursor, ruler and live recording width', () => {
    const timeline = source('voice-studio-timeline-canvas.tsx');
    expect(timeline).toContain('useVoiceStudioLegacyRecordingPlayheadBridge(status, recordStart)');
    expect(timeline).toContain('useVoiceStudioPlayhead()');
    expect(timeline).toContain('visualPlayhead - recordStart');
    expect(timeline).toContain('data-recording-clock-source="session"');
    expect(timeline).not.toContain('elapsed - recordStart');
  });

  it('keeps elapsed only as a deprecated compatibility prop', () => {
    const timeline = source('voice-studio-timeline-canvas.tsx');
    expect(timeline).toContain('elapsed?: number');
    expect(timeline).not.toContain('project, duration, elapsed, viewport');
  });
});
