'use client';

import { useEffect } from 'react';

const HOST_ONLY_PATTERNS = [
  /^Direção$/i,
  /^Direcao$/i,
  /^Apps$/i,
  /^Gravar$/i,
  /Iniciar transmissão/i,
  /Encerrar transmissão/i,
];

export default function LivePermissionGuardRuntime() {
  useEffect(() => {
    const isHost = new URLSearchParams(window.location.search).get('host') === '1';
    document.documentElement.classList.toggle('fl-role-host', isHost);
    document.documentElement.classList.toggle('fl-role-student', !isHost);

    const apply = () => {
      const room = document.querySelector<HTMLElement>('.fl-room');
      if (!room) return;
      room.dataset.role = isHost ? 'host' : 'student';

      document.querySelectorAll<HTMLElement>('.fl-apps-trigger,.fl-host-dock-trigger,.fl-host-quick-dock,.fl-host-notification-settings,.fl-hand-signal').forEach((element) => {
        if (!isHost) element.style.setProperty('display', 'none', 'important');
      });

      if (!isHost) {
        document.querySelectorAll<HTMLElement>('button,[role="button"]').forEach((element) => {
          const label = (element.textContent || element.getAttribute('aria-label') || '').trim();
          if (HOST_ONLY_PATTERNS.some((pattern) => pattern.test(label))) {
            element.dataset.hostOnlyHidden = 'true';
            element.style.setProperty('display', 'none', 'important');
          }
        });
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(apply, 750);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.documentElement.classList.remove('fl-role-host', 'fl-role-student');
    };
  }, []);

  return null;
}
