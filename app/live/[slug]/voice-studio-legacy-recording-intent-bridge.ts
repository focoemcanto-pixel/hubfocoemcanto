export type VoiceStudioLegacyRecordingVisualState = 'idle' | 'countin' | 'recording';

const RECORD_BUTTON_SELECTOR = '.vs-main-controls button.record, .vs-main-controls button.recording';
const COUNT_IN_SELECTOR = '.vs-countin';

export function getVoiceStudioLegacyRecordingVisualState(root: ParentNode = document): VoiceStudioLegacyRecordingVisualState {
  if (root.querySelector(COUNT_IN_SELECTOR)) return 'countin';
  if (root.querySelector('.vs-main-controls button.recording')) return 'recording';
  return 'idle';
}

export function triggerVoiceStudioLegacyRecordingIntent(root: ParentNode = document): boolean {
  const button = root.querySelector<HTMLButtonElement>(RECORD_BUTTON_SELECTOR);
  if (!button || button.disabled) return false;
  button.click();
  return true;
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
    attributeFilter: ['class', 'disabled'],
  });

  return () => observer.disconnect();
}
