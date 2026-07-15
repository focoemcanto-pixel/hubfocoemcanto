'use client';

import { useEffect } from 'react';
import DailyIframe from '@daily-co/daily-js';

declare global {
  interface Window {
    __focoLiveCall?: any;
    __focoMediaLocks?: { audio: boolean; video: boolean };
  }
}

export default function DailyCallBridge() {
  useEffect(() => {
    const daily = DailyIframe as any;
    if (daily.__focoBridgeInstalled) return;

    const originalCreate = daily.createCallObject.bind(daily);
    daily.createCallObject = (...args: any[]) => {
      const call = originalCreate(...args);
      window.__focoLiveCall = call;
      window.__focoMediaLocks = { audio: false, video: false };

      call.on('app-message', (eventData: any) => {
        const data = eventData?.data;
        if (data?.type !== 'moderation') return;
        if (data.command === 'mute-audio') window.__focoMediaLocks!.audio = true;
        if (data.command === 'grant-audio') window.__focoMediaLocks!.audio = false;
        if (data.command === 'stop-camera') window.__focoMediaLocks!.video = true;
        if (data.command === 'grant-camera') window.__focoMediaLocks!.video = false;
      });

      const originalDestroy = call.destroy?.bind(call);
      if (originalDestroy) {
        call.destroy = async (...destroyArgs: any[]) => {
          if (window.__focoLiveCall === call) window.__focoLiveCall = undefined;
          return originalDestroy(...destroyArgs);
        };
      }

      return call;
    };

    daily.__focoBridgeInstalled = true;
  }, []);

  return null;
}
