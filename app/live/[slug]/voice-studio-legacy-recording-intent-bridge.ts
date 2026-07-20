export type VoiceStudioLegacyRecordingVisualState = 'idle' | 'countin' | 'recording';

const COUNT_IN_SELECTOR = '.vs-countin';
const RECORDING_SELECTOR = '.vs-main-controls button.recording';

export function getVoiceStudioLegacyRecordingVisualState(root: ParentNode = document): VoiceStudioLegacyRecordingVisualState {
  if (root.querySelector(COUNT_IN_SELECTOR)) return 'countin';
  if (root.querySelector(RECORDING_SELECTOR)) return 'recording';
  return 'idle';
}

/**
 * Compatibility command bus for the remaining legacy DAW controller.
 *
 * The Session owns the visible Record intent and capture lifecycle. The old
 * controller still owns the browser-specific capture implementation, so this
 * bridge forwards the existing keyboard command without querying or clicking
 * hidden controls.
 */
export function requestVoiceStudioLegacyRecordingToggle(target: Window = window): boolean {
  const event = new KeyboardEvent('keydown', {
    key: 'r',
    code: 'KeyR',
    bubbles: true,
    cancelable: true,
  });
  return target.dispatchEvent(event);
}

export function observeVoiceStudioLegacyRecordingState(
  listener: (state: VoiceStudioLegacyRecordingVisualState) => void,
  root: ParentNode = document,
): () => void {
  let current = getVoiceStudioLegacyRecordingVisualState(root);
  listener(current);

  const observer = new MutationObserver(() => {
    const next = getVoiceStudioLegacyRecordingVisualState(root);
    if (next === current) return;
    current = next;
    listener(next);
  });

  observer.observe(root === document ? document.body : root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  return () => observer.disconnect();
}
