'use client';

import { useEffect } from 'react';

const LEGACY_CONTROL_CLASS = 'fl-offers-library-control';
const LEGACY_OPEN_CLASS = 'fl-offers-library-open';

/**
 * Compatibility cleanup for the old Offers/Direction accordion.
 *
 * The current offers accordion is rendered by LiveToolsRuntime. The previous
 * runtime injected another button and hid the complete offers container. That
 * left the real accordion inside a hidden element and could also place an
 * invisible layer over the director controls, making the remaining buttons
 * appear frozen.
 */
export default function LiveOffersDirectionRuntime() {
  useEffect(() => {
    const isHost = new URLSearchParams(window.location.search).get('host') === '1';
    if (!isHost) return;

    const cleanupLegacyUi = () => {
      document.querySelectorAll<HTMLElement>(`.${LEGACY_CONTROL_CLASS}`).forEach((control) => control.remove());
      document.querySelectorAll<HTMLElement>('.fl-director-panel').forEach((panel) => {
        panel.classList.remove(LEGACY_OPEN_CLASS);
        panel.style.removeProperty('pointer-events');
      });
      document.querySelectorAll<HTMLElement>('.fl-director-offers').forEach((offers) => {
        offers.style.removeProperty('display');
        offers.style.removeProperty('pointer-events');
        offers.removeAttribute('aria-hidden');
      });
    };

    cleanupLegacyUi();
    const observer = new MutationObserver(cleanupLegacyUi);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
