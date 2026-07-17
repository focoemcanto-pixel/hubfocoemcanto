'use client';

import { useEffect, useMemo, useState } from 'react';

type Panel = 'apps' | 'more' | 'audio' | 'camera' | 'permissions' | null;

type MediaSummary = {
  microphones: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
};

function clickByText(selector: string, text: string) {
  const target = Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find((button) =>
    button.textContent?.toLowerCase().includes(text.toLowerCase()),
  );
  target?.click();
  return Boolean(target);
}

function closeNativePanels() {
  document.querySelector<HTMLButtonElement>('.fl-tabs button.active')?.click();
}

export default function MeetShellRuntime() {
  const [panel, setPanel] = useState<Panel>(null);
  const [roomReady, setRoomReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [devices, setDevices] = useState<MediaSummary>({ microphones: [], cameras: [] });

  const panelTitle = useMemo(() => ({
    apps: 'Apps',
    more: 'Mais opções',
    audio: 'Microfone',
    camera: 'Câmera',
    permissions: 'Acesso à sala',
  }[panel || 'apps']), [panel]);

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    const sync = () => setRoomReady(Boolean(document.querySelector('.fl-room')));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!roomReady || !navigator.mediaDevices?.enumerateDevices) return;
    const load = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          microphones: list.filter((device) => device.kind === 'audioinput'),
          cameras: list.filter((device) => device.kind === 'videoinput'),
        });
      } catch {
        setDevices({ microphones: [], cameras: [] });
      }
    };
    void load();
    navigator.mediaDevices.addEventListener?.('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', load);
  }, [roomReady]);

  useEffect(() => {
    if (!roomReady) return;
    const enhance = () => {
      const controls = document.querySelector('.fl-controls');
      const mic = Array.from(controls?.querySelectorAll<HTMLButtonElement>('button') || []).find((button) => button.textContent?.toLowerCase().includes('microfone') || button.textContent?.toLowerCase().includes('ativar mic'));
      const camera = Array.from(controls?.querySelectorAll<HTMLButtonElement>('button') || []).find((button) => button.textContent?.toLowerCase().includes('câmera') || button.textContent?.toLowerCase().includes('ativar câmera'));
      mic?.classList.add('fl-meet-has-menu');
      camera?.classList.add('fl-meet-has-menu');

      const offers = document.querySelector<HTMLElement>('.fl-director-offers');
      if (offers && !offers.dataset.meetAccordion) {
        offers.dataset.meetAccordion = 'true';
        offers.classList.add('fl-meet-collapsed');
        const heading = offers.querySelector('strong');
        if (heading) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'fl-meet-section-toggle';
          toggle.innerHTML = '<span>🎁</span><b>Ofertas desta live</b><i>⌄</i>';
          toggle.addEventListener('click', () => offers.classList.toggle('fl-meet-collapsed'));
          heading.replaceWith(toggle);
        }
      }
    };
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();
    return () => observer.disconnect();
  }, [roomReady]);

  useEffect(() => {
    if (!panel) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.fl-meet-popover') && !target.closest('.fl-meet-shell-controls')) setPanel(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [panel]);

  if (!roomReady) return null;

  const openNative = (name: 'chat' | 'pessoas' | 'direção') => {
    closeNativePanels();
    window.setTimeout(() => {
      clickByText('.fl-tabs button, .fl-controls button', name);
      setPanel(null);
    }, 0);
  };

  const openPiano = () => {
    const launcher = document.querySelector<HTMLButtonElement>('.fl-piano-launcher');
    launcher?.click();
    setPanel(null);
  };

  const togglePanel = (next: Panel) => setPanel((current) => current === next ? null : next);

  return <>
    <div className="fl-meet-shell-controls" aria-label="Controles rápidos da live">
      <button type="button" onClick={() => togglePanel('audio')} aria-expanded={panel === 'audio'} title="Opções do microfone">⌃</button>
      <button type="button" onClick={() => togglePanel('camera')} aria-expanded={panel === 'camera'} title="Opções da câmera">⌃</button>
      <button type="button" className="fl-meet-apps-trigger" onClick={() => togglePanel('apps')} aria-expanded={panel === 'apps'}><span>▦</span><b>Apps</b></button>
      {isHost && <button type="button" className="fl-meet-lock-trigger" onClick={() => togglePanel('permissions')} aria-expanded={panel === 'permissions'} title="Permissões da sala">🔒</button>}
      <button type="button" className="fl-meet-more-trigger" onClick={() => togglePanel('more')} aria-expanded={panel === 'more'} title="Mais opções">•••</button>
    </div>

    {panel && <section className={`fl-meet-popover panel-${panel}`} role="dialog" aria-label={panelTitle}>
      <header><div><small>FOCO LIVE</small><strong>{panelTitle}</strong></div><button type="button" onClick={() => setPanel(null)} aria-label="Fechar">×</button></header>

      {panel === 'apps' && <div className="fl-meet-menu-list">
        <button type="button" onClick={openPiano}><span>🎹</span><div><b>Foco Keys</b><small>Piano sincronizado da aula</small></div><i>›</i></button>
        <button type="button" disabled><span>⏱</span><div><b>Timer</b><small>Em breve</small></div></button>
        <button type="button" disabled><span>🎼</span><div><b>Afinador</b><small>Em breve</small></div></button>
      </div>}

      {panel === 'more' && <div className="fl-meet-menu-list">
        <button type="button" onClick={() => openNative('chat')}><span>💬</span><div><b>Chat</b><small>Mensagens da aula</small></div></button>
        <button type="button" onClick={() => openNative('pessoas')}><span>👥</span><div><b>Participantes</b><small>Pessoas e moderação</small></div></button>
        {isHost && <button type="button" onClick={() => openNative('direção')}><span>🎬</span><div><b>Direção</b><small>Ofertas e transmissão</small></div></button>}
        <button type="button" onClick={() => { clickByText('.fl-top-actions button', 'compartilhar'); setPanel(null); }}><span>↗</span><div><b>Compartilhar</b><small>Convidar participantes</small></div></button>
        {isHost && <button type="button" onClick={() => togglePanel('permissions')}><span>🔒</span><div><b>Acesso à sala</b><small>Entrada e permissões</small></div></button>}
      </div>}

      {panel === 'audio' && <div className="fl-meet-settings-list">
        <button type="button" onClick={() => { clickByText('.fl-controls button', 'microfone') || clickByText('.fl-controls button', 'ativar mic'); setPanel(null); }}><span>🎙</span><div><b>Ativar ou desativar</b><small>Usar o controle principal</small></div></button>
        <div className="fl-meet-device-block"><small>DISPOSITIVO</small><b>{devices.microphones[0]?.label || 'Microfone padrão do navegador'}</b>{devices.microphones.length > 1 && <span>{devices.microphones.length} microfones detectados</span>}</div>
        {isHost && <button type="button" onClick={() => { openNative('direção'); window.setTimeout(() => document.querySelector<HTMLElement>('.fl-director-audio')?.scrollIntoView({ block: 'center' }), 80); }}><span>♫</span><div><b>Perfil de áudio</b><small>Fala ou modo música</small></div><i>›</i></button>}
      </div>}

      {panel === 'camera' && <div className="fl-meet-settings-list">
        <button type="button" onClick={() => { clickByText('.fl-controls button', 'câmera') || clickByText('.fl-controls button', 'ativar câmera'); setPanel(null); }}><span>📹</span><div><b>Ativar ou desativar</b><small>Usar o controle principal</small></div></button>
        <div className="fl-meet-device-block"><small>DISPOSITIVO</small><b>{devices.cameras[0]?.label || 'Câmera padrão do navegador'}</b>{devices.cameras.length > 1 && <span>{devices.cameras.length} câmeras detectadas</span>}</div>
      </div>}

      {panel === 'permissions' && <div className="fl-meet-settings-list">
        <button type="button" onClick={() => openNative('pessoas')}><span>🚪</span><div><b>Sala de espera</b><small>Autorizar ou bloquear entradas</small></div><i>›</i></button>
        <div className="fl-meet-permission-row"><div><b>Entrada de participantes</b><small>Gerenciada no painel Pessoas</small></div><span className="active">ATIVA</span></div>
        <div className="fl-meet-permission-row"><div><b>Microfone e câmera</b><small>Controles individuais por participante</small></div><span className="active">ATIVOS</span></div>
      </div>}
    </section>}
  </>;
}
