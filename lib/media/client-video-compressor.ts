export type CompressionProfile = 'auto' | 'quality' | 'compact' | 'aggressive' | 'ultra';

const MIN_SIZE_FOR_COMPRESSION = 150 * 1024 * 1024;
const DIRECT_UPLOAD_SAFE_LIMIT = 180 * 1024 * 1024;
const VERY_LARGE_VIDEO = 350 * 1024 * 1024;
const MIN_DURATION_RATIO = 0.9;
const MIN_ACCEPTABLE_OUTPUT = 60 * 1024 * 1024;
const IDEAL_MIN_OUTPUT = 80 * 1024 * 1024;
const DEBUG = true;

type CompressOptions = {
  profile: CompressionProfile;
  enabled: boolean;
  onProgress?: (progress: number, label?: string) => void;
};

type CaptureVideoElement = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };

function debug(...args: unknown[]) {
  if (DEBUG) console.info('[hub-compress]', ...args);
}

function supportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) || '';
}

function compressionPlan(profile: CompressionProfile, originalSize: number): CompressionProfile[] {
  if (originalSize >= VERY_LARGE_VIDEO) {
    if (profile === 'quality') return ['quality', 'compact', 'aggressive', 'ultra'];
    if (profile === 'compact') return ['compact', 'aggressive', 'ultra'];
    if (profile === 'aggressive') return ['aggressive', 'ultra'];
    return ['aggressive', 'ultra'];
  }

  if (originalSize >= DIRECT_UPLOAD_SAFE_LIMIT) {
    if (profile === 'quality') return ['quality', 'compact', 'aggressive', 'ultra'];
    if (profile === 'compact') return ['compact', 'aggressive', 'ultra'];
    if (profile === 'aggressive') return ['aggressive', 'ultra'];
    if (profile === 'ultra') return ['ultra'];
    return ['compact', 'aggressive', 'ultra'];
  }

  return [profile === 'auto' ? 'compact' : profile];
}

function profileLabel(profile: CompressionProfile) {
  if (profile === 'ultra') return 'Compressão ultra 1080p';
  if (profile === 'aggressive') return 'Compressão forte 1080p';
  if (profile === 'compact') return 'Compressão compacta 1080p';
  if (profile === 'quality') return 'Compressão em qualidade máxima';
  return 'Compressão automática';
}

function qualityFloorFor(profile: CompressionProfile, originalSize: number) {
  if (originalSize < DIRECT_UPLOAD_SAFE_LIMIT) return 0;
  if (profile === 'ultra') return MIN_ACCEPTABLE_OUTPUT;
  return IDEAL_MIN_OUTPUT;
}

function scoreCandidate(file: File, candidate: File, profile: CompressionProfile) {
  const target = DIRECT_UPLOAD_SAFE_LIMIT;
  const floor = qualityFloorFor(profile, file.size);
  const belowLimit = candidate.size <= target;
  const aboveFloor = !floor || candidate.size >= floor;

  if (belowLimit && aboveFloor) return 1000 - Math.abs(candidate.size - 120 * 1024 * 1024);
  if (belowLimit) return 500 - Math.abs(candidate.size - floor);
  return 100 - candidate.size;
}

function targetFor(profile: CompressionProfile, width: number, height: number, duration = 0) {
  // Para aulas, preservar nitidez é mais importante que esmagar o arquivo.
  // Mantemos 1080p sempre que o original permitir e comprimimos principalmente por bitrate.
  const maxHeight = 1080;
  const scale = height > maxHeight ? maxHeight / height : 1;
  const targetWidth = Math.max(2, Math.round((width * scale) / 2) * 2);
  const targetHeight = Math.max(2, Math.round((height * scale) / 2) * 2);

  const targetBytes = profile === 'ultra'
    ? 130 * 1024 * 1024
    : profile === 'aggressive'
      ? 150 * 1024 * 1024
      : profile === 'compact'
        ? 175 * 1024 * 1024
        : 0;

  const audioBitsPerSecond = profile === 'ultra' ? 144_000 : profile === 'aggressive' ? 160_000 : profile === 'compact' ? 176_000 : 192_000;
  const fixedVideoBitsPerSecond = profile === 'quality' ? 8_000_000 : profile === 'compact' ? 4_500_000 : profile === 'ultra' ? 2_200_000 : profile === 'aggressive' ? 3_000_000 : 6_000_000;
  const budgetVideoBitsPerSecond = targetBytes && duration > 0 ? Math.floor((targetBytes * 8) / duration - audioBitsPerSecond) : fixedVideoBitsPerSecond;
  const minimumVideoBitsPerSecond = profile === 'ultra' ? 1_500_000 : profile === 'aggressive' ? 2_000_000 : 2_600_000;
  const videoBitsPerSecond = Math.max(minimumVideoBitsPerSecond, Math.min(fixedVideoBitsPerSecond, budgetVideoBitsPerSecond));

  return { targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond };
}

function withObjectUrl<T>(fileOrBlob: Blob, run: (url: string) => Promise<T>) {
  const url = URL.createObjectURL(fileOrBlob);
  return run(url).finally(() => URL.revokeObjectURL(url));
}

async function readDuration(blob: Blob) {
  return withObjectUrl(blob, async (url) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.preload = 'metadata';
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('duration_read_failed'));
    });
    return Number.isFinite(video.duration) ? video.duration : 0;
  }).catch((error) => {
    debug('duration read failed', error);
    return 0;
  });
}

async function waitForAudioTrack(video: CaptureVideoElement, audioContext: AudioContext | null, destination: MediaStreamAudioDestinationNode | null) {
  const capture = video.captureStream?.bind(video) || video.mozCaptureStream?.bind(video);
  const capturedStream = capture ? capture() : null;
  const capturedAudioTracks = capturedStream?.getAudioTracks?.() || [];
  if (capturedAudioTracks.length) return capturedAudioTracks;

  if (audioContext && destination) {
    if (audioContext.state === 'suspended') await audioContext.resume().catch(() => undefined);
    const destinationTracks = destination.stream.getAudioTracks();
    if (destinationTracks.length) return destinationTracks;
  }

  return [];
}

async function compressOnce(file: File, profile: CompressionProfile, options: CompressOptions, planIndex: number, planLength: number): Promise<File> {
  const mimeType = supportedMimeType();
  if (!mimeType) throw new Error('Este navegador não suporta MediaRecorder/WebM para compressão local.');

  return withObjectUrl(file, async (url) => {
    debug('start profile', profile, 'input', file.name, file.size);
    const video = document.createElement('video') as CaptureVideoElement;
    video.src = url;
    video.muted = false;
    video.volume = 0;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Não foi possível ler o vídeo para compressão.'));
    });

    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const originalDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const { targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond } = targetFor(profile, width, height, originalDuration);
    debug('metadata', { width, height, originalDuration, targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond, mimeType });

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') throw new Error('Canvas captureStream não está disponível neste navegador.');

    let audioContext: AudioContext | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    try {
      audioContext = new AudioContext();
      destination = audioContext.createMediaStreamDestination();
      const source = audioContext.createMediaElementSource(video);
      source.connect(destination);
    } catch (error) {
      debug('audio context capture unavailable, trying media element captureStream audio', error);
      audioContext = null;
      destination = null;
    }

    const stream = canvas.captureStream(30);

    const chunks: Blob[] = [];
    let recorder: MediaRecorder | null = null;
    let raf = 0;
    const baseProgress = Math.round((planIndex / planLength) * 100);
    const maxProgressForStep = Math.round(((planIndex + 1) / planLength) * 100);
    const draw = () => {
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      if (originalDuration) {
        const stepProgress = Math.round((video.currentTime / originalDuration) * (maxProgressForStep - baseProgress));
        options.onProgress?.(Math.min(99, baseProgress + stepProgress), `${profileLabel(profile)} (${planIndex + 1}/${planLength})`);
      }
      raf = requestAnimationFrame(draw);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      video.onended = () => {
        cancelAnimationFrame(raf);
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      };
      video.onerror = () => reject(new Error('Falha ao reproduzir vídeo durante compressão.'));
      options.onProgress?.(baseProgress || 1, `${profileLabel(profile)} (${planIndex + 1}/${planLength})`);
      raf = requestAnimationFrame(draw);
      video.play().then(async () => {
        const audioTracks = await waitForAudioTrack(video, audioContext, destination);
        debug('audio tracks', { count: audioTracks.length, labels: audioTracks.map((track) => track.label || track.kind) });
        if (!audioTracks.length) throw new Error('Não foi possível capturar a trilha de áudio do vídeo. Compressão cancelada para evitar vídeo mudo.');
        audioTracks.forEach((track) => stream.addTrack(track));
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond });
        recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
        recorder.onerror = () => reject(new Error('Falha ao comprimir vídeo.'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' }));
        recorder.start(1000);
      }).catch((error) => reject(error instanceof Error ? error : new Error('Falha ao iniciar reprodução para compressão.')));
    });

    const blob = await done;
    await audioContext?.close().catch(() => undefined);

    debug('blob generated', { profile, blobSize: blob.size, originalSize: file.size, chunks: chunks.length });
    if (!blob.size) throw new Error(`Compressão ${profile} gerou arquivo vazio.`);

    const compressedDuration = await readDuration(blob);
    debug('duration check', { originalDuration, compressedDuration });
    if (originalDuration && compressedDuration && compressedDuration < originalDuration * MIN_DURATION_RATIO) {
      throw new Error(`Compressão ${profile} encurtou o vídeo (${Math.round(compressedDuration)}s de ${Math.round(originalDuration)}s).`);
    }

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.webm`, { type: blob.type || 'video/webm', lastModified: Date.now() });
  });
}

export async function compressVideoForUpload(file: File, options: CompressOptions): Promise<File> {
  if (!options.enabled) {
    debug('disabled');
    return file;
  }
  if (file.size < MIN_SIZE_FOR_COMPRESSION && options.profile === 'auto') {
    debug('skip small file auto', file.size);
    return file;
  }
  if (typeof window === 'undefined') return file;
  if (typeof MediaRecorder === 'undefined') throw new Error('Este navegador não suporta compressão local com MediaRecorder.');
  if (typeof HTMLCanvasElement === 'undefined') throw new Error('Este navegador não suporta compressão local com Canvas.');
  if (!supportedMimeType()) throw new Error('Este navegador não suporta saída WebM para compressão local.');

  const plan = compressionPlan(options.profile, file.size);
  let best = file;
  let bestScore = Number.NEGATIVE_INFINITY;
  let lastError: unknown = null;
  debug('plan', { file: file.name, size: file.size, selectedProfile: options.profile, plan });

  for (let index = 0; index < plan.length; index += 1) {
    const profile = plan[index];
    try {
      const candidate = await compressOnce(file, profile, options, index, plan.length);
      const floor = qualityFloorFor(profile, file.size);
      const candidateScore = scoreCandidate(file, candidate, profile);
      debug('candidate', { profile, size: candidate.size, original: file.size, floor, candidateScore });

      if (candidate.size < file.size && candidateScore > bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }

      if (candidate.size <= DIRECT_UPLOAD_SAFE_LIMIT && (!floor || candidate.size >= floor)) {
        options.onProgress?.(100, `Vídeo comprimido para envio direto (${formatCompression(file.size, candidate.size)})`);
        return candidate;
      }
    } catch (error) {
      lastError = error;
      debug('profile failed', profile, error);
      options.onProgress?.(Math.min(99, Math.round(((index + 1) / plan.length) * 100)), `Compressão ${profile} falhou, tentando próximo perfil...`);
    }
  }

  if (best.size < file.size) {
    const tooSmall = file.size >= DIRECT_UPLOAD_SAFE_LIMIT && best.size < MIN_ACCEPTABLE_OUTPUT;
    options.onProgress?.(100, tooSmall
      ? `Melhor compressão ficou muito pequena, mas será usada se for o único caminho (${formatCompression(file.size, best.size)})`
      : `Melhor compressão possível (${formatCompression(file.size, best.size)})`);
    return best;
  }

  if (lastError) {
    const message = lastError instanceof Error ? lastError.message : 'compressão local falhou';
    throw new Error(`Não foi possível comprimir este vídeo no navegador: ${message}`);
  }

  return file;
}

function formatCompression(original: number, compressed: number) {
  const percent = Math.max(0, Math.round((1 - compressed / original) * 100));
  return `${percent}% menor`;
}
