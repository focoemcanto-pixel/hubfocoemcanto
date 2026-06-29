'use client';

import { useEffect } from 'react';

function syncDuetLayout() {
  const root = document.querySelector<HTMLElement>('.duet-recording-premium');
  if (!root) return;

  const videoStage = root.querySelector<HTMLElement>('.duet-video-stage');
  const actionConsole = root.querySelector<HTMLElement>('.duet-action-console');
  const durationLine = root.querySelector<HTMLElement>('.duet-duration-line');
  const controlGrid = root.querySelector<HTMLElement>('.duet-control-grid');
  const labels = Array.from(root.querySelectorAll<HTMLElement>('.duet-section-label'));
  const controlLabel = labels.find((item) => item.textContent?.toLowerCase().includes('controles'));

  if (videoStage && actionConsole && actionConsole.previousElementSibling !== videoStage) {
    videoStage.insertAdjacentElement('afterend', actionConsole);
  }
  if (actionConsole && durationLine && durationLine.previousElementSibling !== actionConsole) {
    actionConsole.insertAdjacentElement('afterend', durationLine);
  }
  if (durationLine && controlLabel && controlLabel.previousElementSibling !== durationLine) {
    durationLine.insertAdjacentElement('afterend', controlLabel);
  }
  if (controlLabel && controlGrid && controlGrid.previousElementSibling !== controlLabel) {
    controlLabel.insertAdjacentElement('afterend', controlGrid);
  }

  const reviewActions = root.querySelector<HTMLElement>('.duet-after-record-actions');
  const recordButton = root.querySelector<HTMLButtonElement>('.duet-action-console .record-main');
  const redoButton = reviewActions?.querySelector<HTMLButtonElement>('button');

  if (recordButton) {
    const isReview = Boolean(reviewActions && redoButton);
    if (isReview) {
      recordButton.disabled = false;
      recordButton.dataset.duetReviewAction = 'redo';
      const title = recordButton.querySelector('strong');
      const subtitle = recordButton.querySelector('small');
      if (title) title.textContent = 'Regravar';
      if (subtitle) subtitle.textContent = 'Gravar novamente';
      reviewActions!.style.display = 'none';
    } else if (recordButton.dataset.duetReviewAction === 'redo') {
      delete recordButton.dataset.duetReviewAction;
      reviewActions?.style.removeProperty('display');
    }
  }
}

export function DuetLayoutGuard() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const recordButton = target?.closest<HTMLButtonElement>('.duet-recording-premium .duet-action-console .record-main[data-duet-review-action="redo"]');
      if (!recordButton) return;
      const root = recordButton.closest<HTMLElement>('.duet-recording-premium');
      const redoButton = root?.querySelector<HTMLButtonElement>('.duet-after-record-actions button');
      if (!redoButton) return;
      event.preventDefault();
      event.stopPropagation();
      redoButton.click();
      window.setTimeout(syncDuetLayout, 50);
    };

    syncDuetLayout();
    const timer = window.setInterval(syncDuetLayout, 250);
    const observer = new MutationObserver(syncDuetLayout);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    document.addEventListener('click', onClick, true);

    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
