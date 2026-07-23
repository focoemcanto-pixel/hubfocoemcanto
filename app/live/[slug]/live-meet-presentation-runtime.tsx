'use client';

import { useEffect, useState } from 'react';

type StudioSceneMessage = {
  type?: string;
  open?: boolean;
  app?: 'board' | 'voice' | null;
  [key: string]: unknown;
};

type LiveCall = {
  __focoMeetPresentationWrapped?: boolean;
  __focoMeetPresentationActive?: boolean;
  sendAppMessage?: (message: StudioSceneMessage, recipient: string) => unknown;
  startScreenShare?: (options?: unknown) => Promise<unknown>;
  stopScreenShare?: () => Promise<unknown>;
  on?: (event: string, listener: () => void) => void;
};

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: LiveCall };

export default function LiveMeetPresentationRuntime() {
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const isHost = new URLSearchParams(window.location.search).get('host') === '1';
    if (!isHost) return;

    const attach = () => {
      const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
      if (!call || call.__focoMeetPresentationWrapped || typeof call.sendAppMessage !== 'function') return;

      const originalSend = call.sendAppMessage.bind(call);
      call.__focoMeetPresentationWrapped = true;

      call.on?.('local-screen-share-stopped', () => {
        call.__focoMeetPresentationActive = false;
      });
      call.on?.('local-screen-share-canceled', () => {
        call.__focoMeetPresentationActive = false;
        setNotice('A apresentação foi cancelada. Clique novamente e escolha “Esta guia” ou a janela do Foco Live.');
      });

      call.sendAppMessage = (message, recipient) => {
        const isStudioScene = message?.type === 'foco-studio-scene';
        const isSupportedApp = message?.app === 'board' || message?.app === 'voice' || message?.app == null;
        if (!isStudioScene || !isSupportedApp) return originalSend(message, recipient);

        if (message.open) {
          if (call.__focoMeetPresentationActive) return;
          if (typeof call.startScreenShare !== 'function') {
            setNotice('Este navegador não permite apresentar a tela por esta sala.');
            return;
          }

          call.__focoMeetPresentationActive = true;
          setNotice('Na janela do navegador, escolha “Esta guia” para mostrar o Foco Board ou Voice Studio exatamente como no Google Meet.');

          void call.startScreenShare({
            preferCurrentTab: true,
            selfBrowserSurface: 'include',
            surfaceSwitching: 'include',
            systemAudio: 'include',
          }).then(() => {
            setNotice('');
            window.setTimeout(() => window.focus(), 250);
          }).catch(() => {
            call.__focoMeetPresentationActive = false;
            setNotice('Não foi possível iniciar a apresentação. Clique novamente e confirme a guia ou janela no navegador.');
          });
          return;
        }

        if (call.__focoMeetPresentationActive) {
          call.__focoMeetPresentationActive = false;
          void call.stopScreenShare?.().catch(() => undefined);
        }
      };
    };

    const timer = window.setInterval(attach, 250);
    attach();
    return () => window.clearInterval(timer);
  }, []);

  if (!notice) return null;
  return <div className="fl-toast" onClick={() => setNotice('')}>{notice}</div>;
}
