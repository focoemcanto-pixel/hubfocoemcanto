import type { DuetV2RecorderKind } from './types';
import { blobFromChunks, recorderOptions, safeStopRecorder } from './utils';

export type DuetV2RecorderHandle = {
  kind: DuetV2RecorderKind;
  recorder: MediaRecorder;
  chunks: Blob[];
  mimeType: string;
  start: () => void;
  stop: () => Promise<Blob | null>;
};

export function createDuetV2Recorder(kind: DuetV2RecorderKind, stream: MediaStream): DuetV2RecorderHandle | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (!stream.getTracks().length) return null;

  const recorder = new MediaRecorder(stream, recorderOptions(kind));
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  return {
    kind,
    recorder,
    chunks,
    mimeType: recorder.mimeType,
    start: () => recorder.start(500),
    stop: () => new Promise<Blob | null>((resolve) => {
      const finish = () => resolve(blobFromChunks(chunks, recorder.mimeType));
      if (recorder.state === 'inactive') return finish();
      recorder.addEventListener('stop', finish, { once: true });
      safeStopRecorder(recorder);
    }),
  };
}

export async function stopDuetV2Recorders(recorders: Array<DuetV2RecorderHandle | null>) {
  const results = await Promise.all(recorders.map((handle) => handle?.stop() ?? Promise.resolve(null)));
  return results;
}
