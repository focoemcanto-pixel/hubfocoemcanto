'use client';

import { useEffect } from 'react';

const DAILY_TRAINING_SCROLL_KEY = 'hub:foco-em-canto:daily-training-scroll';

function getDailyTrainingCarousel() {
  return document.querySelector<HTMLElement>('.daily-workout-carousel');
}

function shouldSaveBeforeNavigation(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute('href') || '';
  return /^\/aluno\/central\/diarios\/\d+/.test(href);
}

export function DailyTrainingScrollRestorer() {
  useEffect(() => {
    const carousel = getDailyTrainingCarousel();
    if (!carousel) return;

    const restoreScroll = () => {
      const savedScroll = Number(sessionStorage.getItem(DAILY_TRAINING_SCROLL_KEY) || 0);
      if (!Number.isFinite(savedScroll) || savedScroll <= 0) return;
      carousel.scrollTo({ top: savedScroll, behavior: 'auto' });
    };

    const saveScroll = () => {
      sessionStorage.setItem(DAILY_TRAINING_SCROLL_KEY, String(carousel.scrollTop));
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!target || !shouldSaveBeforeNavigation(target)) return;
      saveScroll();
    };

    restoreScroll();
    const firstFrame = window.requestAnimationFrame(restoreScroll);
    const secondPass = window.setTimeout(restoreScroll, 120);

    carousel.addEventListener('scroll', saveScroll, { passive: true });
    document.addEventListener('click', handleClick, true);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(secondPass);
      carousel.removeEventListener('scroll', saveScroll);
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  return null;
}
