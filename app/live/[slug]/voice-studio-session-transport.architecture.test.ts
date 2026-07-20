import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const transportSource = readFileSync(new URL('./voice-studio-session-transport.tsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('./voice-studio-workspace-components.tsx', import.meta.url), 'utf8');

describe('Session-backed visual Transport architecture', () => {
  it('mounts the keyboard owner before the legacy TrackArea', () => {
    expect(workspaceSource.indexOf('<VoiceStudioTransportKeyboardOwner')).toBeGreaterThan(-1);
    expect(workspaceSource.indexOf('<VoiceStudioTransportKeyboardOwner')).toBeLessThan(workspaceSource.indexOf('<VoiceStudioDawController'));
  });

  it('renders the visual Transport from the Session boundary', () => {
    expect(workspaceSource).toContain('return <VoiceStudioSessionTransport />');
    expect(transportSource).toContain('useVoiceStudioSessionTransport()');
    expect(transportSource).toContain('commands.play(createRequest())');
    expect(transportSource).toContain('commands.pause()');
    expect(transportSource).toContain('commands.stop()');
    expect(transportSource).toContain('commands.returnToStart()');
  });

  it('gives Space a single owner before legacy handlers can run', () => {
    expect(transportSource).toContain("event.code !== 'Space'");
    expect(transportSource).toContain('event.stopImmediatePropagation()');
    expect(transportSource).toContain('commands.handleKeyDown(event, createRequest())');
  });

  it('removes legacy transport controls from interaction without hiding editor tools', () => {
    expect(transportSource).toContain('.vs-main-controls{display:none!important}');
    expect(transportSource).not.toContain('.vs-edit-tools{display:none');
  });

  it('builds playback requests from the live Session project', () => {
    expect(transportSource).toContain('projectDuration(session.project)');
    expect(transportSource).toContain('session.transport.getSnapshot().playhead');
    expect(transportSource).toContain('session.project.loop.enabled');
  });
});
