export type CompressionProfile = 'auto' | 'quality' | 'compact' | 'aggressive' | 'ultra';

const MIN_SIZE_FOR_COMPRESSION = 150 * 1024 * 1024;
const DIRECT_UPLOAD_SAFE_LIMIT = 180 * 1024 * 1024;
const VERY_LARGE_VIDEO = 350 * 1024 * 1024;

// Segurança: se a compressão gerar algo pequeno demais, provavelmente houve erro
// de encode/reprodução no navegador. Nesse caso o Hub envia o original.
const MIN_OUTPUT_RATIO = 0.08;
const MIN_DURATION_RATIO = 0.9;

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
  if (profile === 'ultra') return 'Compressão ultra aplicada por tamanho do arquivo';
  if (profile === 'aggressive') return 'Compressão agressiva aplicada por tamanho do arquivo';
  if (profile === 'compact') return 'Compressão compacta aplicada';
  if (profile === 'quality') return 'Compressão em qualidade máxima';
  return 'Compressão automática';
}

function targetFor(profile: CompressionProfile, width: number, height: number, duration = 0) {
  const maxHeight = profile === 'ultra' ? 540 : profile === 'aggressive' || profile === 'compact' ? 720 : 1080;
  const scale = height > maxHeight ? maxHeight / height : 1;
  const targetWidth = Math.max(2, Math.round((width * scale) / 2) * 2);
  const targetHeight = Math.max(2, Math.round((height * scale) / 2) * 2);

  // Perfis grandes trabalham por orçamento de tamanho final. O objetivo é ficar
  // abaixo do limite operacional do upload direto, preservando áudio aceitável
  // para aula musical/vocal.
  const targetBytes = profile === 'ultra'
    ? 135 * 1024 * 1024
    : profile === 'aggressive'
      ? 165 * 1024 * 1024
      : profile === 'compact'
        ? 210 * 1024 * 1024
        : 0;

  const audioBitsPerSecond = profile === 'ultra' ? 96_000 : profile === 'aggressive' ? 112_000 : profile === 'compact' ? 128_000 : 160_000;
  const fixedVideoBitsPerSecond = profile === 'quality' ? 8_000_000 : profile === 'compact' ? 3_200_000 : profile === 'ultra' ? 850_000 : profile === 'aggressive' ? 1_500_000 : 6_000_000;
  const budgetVideoBitsPerSecond = targetBytes && duration > 0 ? Math.floor((targetBytes * 8) / duration - audioBitsPerSecond) : fixedVideoBitsPerSecond;
  const minimumVideoBitsPerSecond = profile === 'ultra' ? 350_000 : profile === 'aggressive' ? 650_000 : 1_200_000;
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
  }).catch(() => 0);
}

async function compressOnce(file: File, profile: CompressionProfile, options: CompressOptions, planIndex: number, planLength: number): Promise<File> {
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
    const originalDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const { targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond } = targetFor(profile, width, height, originalDuration);

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
    const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType(), videoBitsPerSecond, audioBitsPerSecond });
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);

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
      recorder.onerror = () => reject(new Error('Falha ao comprimir vídeo.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: supportedMimeType().split(';')[0] || 'video/webm' }));
      video.onended = () => {
        cancelAnimationFrame(raf);
        if (recorder.state !== 'inactive') recorder.stop();
      };
      video.onerror = () => reject(new Error('Falha ao reproduzir vídeo durante compressão.'));
    });

    options.onProgress?.(baseProgress || 1, `${profileLabel(profile)} (${planIndex + 1}/${planLength})`);
    recorder.start(1000);
    raf = requestAnimationFrame(draw);
    await video.play();
    const blob = await done;
    await audioContext?.close().catch(() => undefined);

    if (!blob.size || blob.size >= file.size * 0.96) return file;
    if (blob.size < file.size * MIN_OUTPUT_RATIO) return file;

    const compressedDuration = await readDuration(blob);
    if (originalDuration && compressedDuration && compressedDuration < originalDuration * MIN_DURATION_RATIO) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.webm`, { type: blob.type || 'video/webm', lastModified: Date.now() });
  }).catch(() => file);
}

export async function compressVideoForUpload(file: File, options: CompressOptions): Promise<File> {
  if (!options.enabled) return file;
  if (file.size < MIN_SIZE_FOR_COMPRESSION && options.profile === 'auto') return file;
  if (typeof window === 'undefined') return file;
  if (typeof MediaRecorder === 'undefined') return file;
  if (typeof HTMLCanvasElement === 'undefined') return file;
  if (!supportedMimeType()) return file;

  const plan = compressionPlan(options.profile, file.size);
  let best = file;

  for (let index = 0; index < plan.length; index += 1) {
    const profile = plan[index];
    const candidate = await compressOnce(file, profile, options, index, plan.length);

    if (candidate.size < best.size) best = candidate;
    if (candidate.size <= DIRECT_UPLOAD_SAFE_LIMIT) {
      options.onProgress?.(100, `Vídeo comprimido para envio direto (${formatCompression(file.size, candidate.size)})`);
      return candidate;
    }
  }

  if (best.size < file.size) {
    options.onProgress?.(100, `Melhor compressão possível (${formatCompression(file.size, best.size)})`);
    return best;
  }

  return file;
}

function formatCompression(original: number, compressed: number) {
  const percent = Math.max(0, Math.round((1 - compressed / original) * 100));
  return `${percent}% menor`;
}
