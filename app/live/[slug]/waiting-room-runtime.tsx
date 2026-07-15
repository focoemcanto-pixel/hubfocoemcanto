'use client';

import { useEffect } from 'react';

export default function WaitingRoomRuntime({ slug }: { slug: string }) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const joinPath = `/api/live/${slug}/join`;
    let admissionToken: string | null = null;

    function showWaiting(name: string) {
      let overlay = document.querySelector<HTMLDivElement>('[data-waiting-room-overlay]');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.dataset.waitingRoomOverlay = 'true';
        overlay.className = 'fl-waiting-room-overlay';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = `<div class="fl-waiting-room-card"><div class="fl-waiting-pulse">F</div><span>SALA DE ESPERA</span><h2>Aguarde um instante, ${name || 'participante'}.</h2><p>Sua solicitação foi enviada. O apresentador permitirá sua entrada em breve.</p><small>Você pode manter esta tela aberta.</small></div>`;
    }

    function hideWaiting() {
      document.querySelector('[data-waiting-room-overlay]')?.remove();
    }

    async function requestAdmission(payload: any) {
      const response = await originalFetch(`/api/live/${slug}/entry-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: payload.name, email: payload.email, whatsapp: payload.whatsapp }),
      });
      const data = await response.json();
      if (data.status === 'open') return null;
      admissionToken = data.id;
      showWaiting(payload.name);

      return new Promise<string>((resolve, reject) => {
        const timer = window.setInterval(async () => {
          try {
            const check = await originalFetch(`/api/live/${slug}/entry-request?requestId=${data.id}`, { cache: 'no-store' });
            const state = await check.json();
            if (state.status === 'approved') {
              window.clearInterval(timer);
              hideWaiting();
              resolve(data.id);
            }
            if (state.status === 'denied') {
              window.clearInterval(timer);
              hideWaiting();
              reject(new Error('O apresentador não autorizou sua entrada.'));
            }
          } catch {
            // mantém a espera enquanto houver oscilação de rede
          }
        }, 1800);
      });
    }

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes(joinPath) || !init?.body) return originalFetch(input, init);

      const payload = JSON.parse(String(init.body));
      if (payload.mode === 'host' || payload.admissionToken || admissionToken) {
        if (admissionToken && !payload.admissionToken) payload.admissionToken = admissionToken;
        return originalFetch(input, { ...init, body: JSON.stringify(payload) });
      }

      const first = await originalFetch(input, init);
      if (first.status !== 423) return first;
      try {
        const token = await requestAdmission(payload);
        if (!token) return originalFetch(input, init);
        payload.admissionToken = token;
        admissionToken = token;
        return originalFetch(input, { ...init, body: JSON.stringify(payload) });
      } catch (error) {
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Entrada não autorizada.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }) as typeof window.fetch;

    async function hostPanel() {
      const host = document.querySelector('.host-studio');
      const header = document.querySelector('.fl-topbar');
      if (!host || !header) return;
      const response = await originalFetch(`/api/live/${slug}/entry-control`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      let panel = document.querySelector<HTMLDivElement>('[data-entry-control]');
      if (!panel) {
        panel = document.createElement('div');
        panel.dataset.entryControl = 'true';
        panel.className = 'fl-entry-control';
        const share = header.querySelector('[data-live-share]');
        if (share) share.insertAdjacentElement('beforebegin', panel);
        else header.appendChild(panel);
      }
      const requests = (data.requests || []).map((item: any) => `<div class="fl-entry-request"><div><strong>${item.guest_name}</strong><small>quer entrar na live</small></div><button data-entry-action="approve" data-id="${item.id}">Permitir</button><button data-entry-action="deny" data-id="${item.id}">Recusar</button></div>`).join('');
      panel.innerHTML = `<button class="fl-lock-toggle" data-entry-action="${data.locked ? 'unlock' : 'lock'}">${data.locked ? '🔒 Entrada trancada' : '🟢 Entrada liberada'}</button>${data.requests?.length ? `<section><header><b>${data.requests.length} aguardando</b><button data-entry-action="approve-all">Permitir todos</button></header>${requests}</section>` : ''}`;
    }

    const clickHandler = async (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-entry-action]');
      if (!target) return;
      await originalFetch(`/api/live/${slug}/entry-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: target.dataset.entryAction, requestId: target.dataset.id }),
      });
      hostPanel();
    };

    document.addEventListener('click', clickHandler);
    const timer = window.setInterval(hostPanel, 2000);
    hostPanel();

    return () => {
      window.fetch = originalFetch;
      window.clearInterval(timer);
      document.removeEventListener('click', clickHandler);
      hideWaiting();
      document.querySelector('[data-entry-control]')?.remove();
    };
  }, [slug]);

  return null;
}
