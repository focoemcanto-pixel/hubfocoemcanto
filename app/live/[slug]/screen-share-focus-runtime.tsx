'use client';

import { useEffect } from 'react';

export default function ScreenShareFocusRuntime() {
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (options?: any) => Promise<MediaStream> };
    const original = mediaDevices.getDisplayMedia?.bind(mediaDevices);
    if (!original) return;

    mediaDevices.getDisplayMedia = async (options: any = {}) => {
      const CaptureControllerCtor = (window as any).CaptureController;
      if (!CaptureControllerCtor) return original(options);

      const controller = new CaptureControllerCtor();
      const stream = await original({ ...options, controller });
      try { controller.setFocusBehavior('no-focus-change'); } catch {}
      window.setTimeout(() => window.focus(), 0);
      return stream;
    };

    return () => { mediaDevices.getDisplayMedia = original; };
  }, []);

  return null;
}
