export type CompressionProfile = 'auto' | 'quality' | 'compact';

const MIN_SIZE_FOR_COMPRESSION = 150 * 1024 * 1024;

type CompressOptions = {
  profile: CompressionProfile;
  enabled: boolean;
  onProgress?: (progress: number, label?: string) => void;
};

function supportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) || '';
}

function targetFor(profile: CompressionProfile, width: number, height: number) {
  const maxHeight = profile === 'compact' ? 720 : 1080;
  const scale = height > maxHeight ? maxHeight / height : 1;
  const targetWidth = Math.max(2, Math.round((width * scale) / 2) * 2);
  const targetHeight = Math.max(2, Math.round((height * scale) / 2) * 2);
  const videoBitsPerSecond = profile === 'quality' ? 6_000_000 : profile === 'compact' ? 2_200_000 : 4_000_000;
  const audioBitsPerSecond = profile === 'compact' ? 96_000 : 128_000;
  return { targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond };
}

function withObjectUrl<T>(file: File, run: (url: string) => Promise<T>) {
  const url = URL.createObjectURL(file);
  return run(url).finally(() => URL.revokeObjectURL(url));
}

export async function compressVideoForUpload(file: File, options: CompressOptions): Promise<File> {
  if (!options.enabled) return file;
  if (file.size < MIN_SIZE_FOR_COMPRESSION && options.profile === 'auto') return file;
  if (typeof window === 'undefined') return file;
  if (typeof MediaRecorder === 'undefined') return file;
  if (typeof HTMLCanvasElement === 'undefined') return file;
  const mimeType = supportedMimeType();
  if (!mimeType) return file;

  return withObjectUrl(file, async (url) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Não foi possível ler o vídeo para compressão.'));
    });

    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const { targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond } = targetFor(options.profile, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') return file;

    let audioContext: AudioContext | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    try {
      audioContext = new AudioContext();
      destination = audioContext.createMediaStreamDestination();
      const source = audioContext.createMediaElementSource(video);
      source.connect(destination);
    } catch {
      audioContext = null;
      destination = null;
    }

    const stream = canvas.captureStream(30);
    destination?.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond });
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);

    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      if (duration) options.onProgress?.(Math.min(99, Math.round((video.currentTime / duration) * 100)), 'Comprimindo vídeo');
      raf = requestAnimationFrame(draw);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Falha ao comprimir vídeo.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' }));
      video.onended = () => {
        cancelAnimationFrame(raf);
        if (recorder.state !== 'inactive') recorder.stop();
      };
      video.onerror = () => reject(new Error('Falha ao reproduzir vídeo durante compressão.'));
    });

    options.onProgress?.(1, 'Comprimindo vídeo');
    recorder.start(1000);
    raf = requestAnimationFrame(draw);
    await video.play();
    const blob = await done;
    await audioContext?.close().catch(() => undefined);

    if (!blob.size || blob.size >= file.size * 0.92) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    options.onProgress?.(100, 'Vídeo comprimido');
    return new File([blob], `${baseName}.webm`, { type: blob.type || 'video/webm', lastModified: Date.now() });
  }).catch(() => file);
}
