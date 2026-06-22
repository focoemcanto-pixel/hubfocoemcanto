function mediaAudioTracks(media: HTMLMediaElement) {
  const element = media as HTMLMediaElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  const stream = element.captureStream?.() || element.mozCaptureStream?.();
  return stream?.getAudioTracks() || [];
}

export function buildDuetMonitorAudio(reference: HTMLVideoElement, stream: MediaStream) {
  const referenceTracks = mediaAudioTracks(reference);

  return {
    tracks: stream.getAudioTracks(),
    referenceTracks,
    context: null as AudioContext | null,
  };
}
