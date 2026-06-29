import { DuetBufferEngine, type VoicePreset } from './duet-buffer-engine';

type Settings = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
  latencyMs?: number;
};

export async function loadDuetBufferEngine(args: {
  voiceBlob: Blob;
  referenceSource: string;
  referenceBlob?: Blob | null;
  previewVideo: HTMLVideoElement | null;
  settings: () => Settings;
  previous?: DuetBufferEngine | null;
}) {
  const engine = new DuetBufferEngine(args.settings);
  args.previous?.destroy();

  await engine.load(args.voiceBlob, args.referenceSource);

  engine.setVideo(args.previewVideo);
  return engine;
}

export async function toggleDuetBufferPlayback(args: {
  engine: DuetBufferEngine | null;
  video: HTMLVideoElement | null;
  canLiveEdit: boolean;
}) {
  const video = args.video;
  if (!video) return false;
  if (!args.canLiveEdit) {
    if (video.paused) await video.play().catch(() => undefined);
    else video.pause();
    return !video.paused;
  }
  args.engine?.setVideo(video);
  return Boolean(await args.engine?.toggle());
}
