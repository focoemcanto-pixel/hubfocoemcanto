export type CompressionProfile = 'auto' | 'quality' | 'compact' | 'aggressive' | 'ultra';

const MIN_SIZE_FOR_COMPRESSION = 120 * 1024 * 1024;
const DIRECT_UPLOAD_SAFE_LIMIT = 190 * 1024 * 1024;
const VERY_LARGE_VIDEO = 600 * 1024 * 1024;
const MIN_DURATION_RATIO = 0.9;
const MIN_ACCEPTABLE_OUTPUT = 130 * 1024 * 1024;
const IDEAL_MIN_OUTPUT = 150 * 1024 * 1024;
const DEBUG = true;

type CompressionTarget = { targetWidth: number; targetHeight: number; videoBitsPerSecond: number; audioBitsPerSecond: number };
type CompressOptions = { profile: CompressionProfile; enabled: boolean; onProgress?: (progress: number, label?: string) => void };
type CaptureVideoElement = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
type RecorderFormat = { mimeType: string; extension: 'mp4' | 'webm'; label: string };

function debug(...args: unknown[]) { if (DEBUG) console.info('[hub-compress]', ...args); }
function supportedFormat(): RecorderFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates: RecorderFormat[] = [
    { mimeType: 'video/mp4;codecs="avc3.42E01E,mp4a.40.2"', extension: 'mp4', label: 'MP4/H.264 avc3 + AAC' },
    { mimeType: 'video/mp4;codecs=avc3.42E01E,mp4a.40.2', extension: 'mp4', label: 'MP4/H.264 avc3 + AAC' },
    { mimeType: 'video/mp4;codecs="avc3.640028,mp4a.40.2"', extension: 'mp4', label: 'MP4/H.264 avc3 High + AAC' },
    { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', label: 'WebM/VP9 + Opus' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', label: 'WebM/VP8 + Opus' },
    { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
  ];
  return candidates.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) || null;
}
function supportedMimeType() { return supportedFormat()?.mimeType || ''; }

function compressionPlan(profile: CompressionProfile, originalSize: number): CompressionProfile[] {
  if (originalSize >= VERY_LARGE_VIDEO) return ['quality', 'compact', 'aggressive', 'ultra'];
  if (originalSize >= DIRECT_UPLOAD_SAFE_LIMIT) return ['quality', 'compact', 'aggressive', 'ultra'];
  if (originalSize >= MIN_SIZE_FOR_COMPRESSION) return ['quality', 'compact', 'aggressive'];
  return [profile === 'auto' ? 'compact' : profile];
}

function profileLabel(profile: CompressionProfile) {
  if (profile === 'ultra') return 'Compressão 1080p forte';
  if (profile === 'aggressive') return 'Compressão 1080p equilibrada';
  if (profile === 'compact') return 'Compressão 1080p alta';
  if (profile === 'quality') return 'Compressão 1080p máxima';
  return 'Compressão automática';
}

function qualityFloorFor(profile: CompressionProfile, originalSize: number) { if (originalSize < DIRECT_UPLOAD_SAFE_LIMIT) return 0; return profile === 'ultra' ? MIN_ACCEPTABLE_OUTPUT : IDEAL_MIN_OUTPUT; }
function scoreCandidate(file: File, candidate: File, profile: CompressionProfile) { const floor = qualityFloorFor(profile, file.size); if (candidate.size <= DIRECT_UPLOAD_SAFE_LIMIT && (!floor || candidate.size >= floor)) return 1000 - Math.abs(candidate.size - 175 * 1024 * 1024); if (candidate.size <= DIRECT_UPLOAD_SAFE_LIMIT) return 500 - Math.abs(candidate.size - floor); return 100 - candidate.size; }

function computeDimensions(width: number, height: number) {
  const safeWidth = width || 1920;
  const safeHeight = height || 1080;
  const isPortrait = safeHeight > safeWidth;
  if (isPortrait) return { targetWidth: 1080, targetHeight: 1920 };
  const maxHeight = 1080;
  const scale = safeHeight > maxHeight ? maxHeight / safeHeight : 1;
  return { targetWidth: Math.max(2, Math.round((safeWidth * scale) / 2) * 2), targetHeight: Math.max(2, Math.round((safeHeight * scale) / 2) * 2) };
}

function targetFor(profile: CompressionProfile, width: number, height: number, duration = 0): CompressionTarget {
  const { targetWidth, targetHeight } = computeDimensions(width, height);
  const isPortrait1080 = targetHeight >= 1920;
  const targetBytes = profile === 'ultra' ? 145 * 1024 * 1024 : profile === 'aggressive' ? 165 * 1024 * 1024 : profile === 'compact' ? 180 * 1024 * 1024 : 185 * 1024 * 1024;
  const audioBitsPerSecond = profile === 'ultra' ? 160_000 : profile === 'aggressive' ? 192_000 : profile === 'compact' ? 224_000 : 256_000;
  const qualityBoost = isPortrait1080 ? 1.15 : 1;
  const fixedVideoBitsPerSecond = Math.round((profile === 'quality' ? 18_000_000 : profile === 'compact' ? 14_000_000 : profile === 'ultra' ? 7_500_000 : profile === 'aggressive' ? 10_000_000 : 16_000_000) * qualityBoost);
  const budgetVideoBitsPerSecond = targetBytes && duration > 0 ? Math.floor((targetBytes * 8) / duration - audioBitsPerSecond) : fixedVideoBitsPerSecond;
  const minimumVideoBitsPerSecond = Math.round((profile === 'ultra' ? 4_500_000 : profile === 'aggressive' ? 6_000_000 : profile === 'compact' ? 7_500_000 : 9_000_000) * qualityBoost);
  const videoBitsPerSecond = Math.max(minimumVideoBitsPerSecond, Math.min(fixedVideoBitsPerSecond, budgetVideoBitsPerSecond));
  return { targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond };
}

function withObjectUrl<T>(fileOrBlob: Blob, run: (url: string) => Promise<T>) { const url = URL.createObjectURL(fileOrBlob); return run(url).finally(() => URL.revokeObjectURL(url)); }
async function readDuration(blob: Blob) { return withObjectUrl(blob, async (url) => { const video = document.createElement('video'); video.src = url; video.muted = true; video.preload = 'metadata'; await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('duration_read_failed')); }); return Number.isFinite(video.duration) ? video.duration : 0; }).catch(() => 0); }
async function waitForLoadedFrame(video: HTMLVideoElement) { if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) return; await new Promise<void>((resolve, reject) => { const done = () => resolve(); video.onloadeddata = done; video.oncanplay = done; video.onerror = () => reject(new Error('Não foi possível carregar o primeiro quadro do vídeo.')); }); }
async function waitForAudioTrack(video: CaptureVideoElement, audioContext: AudioContext | null, destination: MediaStreamAudioDestinationNode | null) { const capture = video.captureStream?.bind(video) || video.mozCaptureStream?.bind(video); const capturedAudioTracks = capture?.().getAudioTracks?.() || []; if (capturedAudioTracks.length) return capturedAudioTracks; if (audioContext && destination) { if (audioContext.state === 'suspended') await audioContext.resume().catch(() => undefined); const tracks = destination.stream.getAudioTracks(); if (tracks.length) return tracks; } return []; }

async function compressOnce(file: File, profile: CompressionProfile, options: CompressOptions, planIndex: number, planLength: number): Promise<File> {
  const format = supportedFormat();
  if (!format) throw new Error('Este navegador não suporta MediaRecorder para compressão local.');
  return withObjectUrl(file, async (url) => {
    const video = document.createElement('video') as CaptureVideoElement;
    video.src = url; video.muted = false; video.volume = 0; video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('Não foi possível ler o vídeo para compressão.')); });
    await waitForLoadedFrame(video);
    const originalDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const originalWidth = video.videoWidth || 1920;
    const originalHeight = video.videoHeight || 1080;
    const { targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond } = targetFor(profile, originalWidth, originalHeight, originalDuration);
    debug('metadata', { profile, format: format.label, mimeType: format.mimeType, originalWidth, originalHeight, targetWidth, targetHeight, videoBitsPerSecond, audioBitsPerSecond, originalDuration });
    const canvas = document.createElement('canvas'); canvas.width = targetWidth; canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') throw new Error('Canvas captureStream não está disponível neste navegador.');
    let audioContext: AudioContext | null = null; let destination: MediaStreamAudioDestinationNode | null = null;
    try { audioContext = new AudioContext(); destination = audioContext.createMediaStreamDestination(); audioContext.createMediaElementSource(video).connect(destination); } catch { audioContext = null; destination = null; }
    const stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    let recorder: MediaRecorder | null = null;
    let raf = 0;
    const baseProgress = Math.round((planIndex / planLength) * 100);
    const maxProgressForStep = Math.round(((planIndex + 1) / planLength) * 100);
    const draw = () => { ctx.drawImage(video, 0, 0, targetWidth, targetHeight); if (originalDuration) options.onProgress?.(Math.min(99, baseProgress + Math.round((video.currentTime / originalDuration) * (maxProgressForStep - baseProgress))), `${profileLabel(profile)} (${planIndex + 1}/${planLength})`); raf = requestAnimationFrame(draw); };
    const done = new Promise<Blob>((resolve, reject) => {
      video.onended = () => { cancelAnimationFrame(raf); if (recorder && recorder.state !== 'inactive') recorder.stop(); };
      video.onerror = () => reject(new Error('Falha ao reproduzir vídeo durante compressão.'));
      options.onProgress?.(baseProgress || 1, `${profileLabel(profile)} (${planIndex + 1}/${planLength})`);
      raf = requestAnimationFrame(draw);
      video.play().then(async () => {
        const audioTracks = await waitForAudioTrack(video, audioContext, destination);
        if (!audioTracks.length) throw new Error('Não foi possível capturar a trilha de áudio do vídeo.');
        audioTracks.forEach((track) => stream.addTrack(track));
        recorder = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond, audioBitsPerSecond });
        recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
        recorder.onerror = () => reject(new Error('Falha ao comprimir vídeo.'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: format.mimeType.split(';')[0] || (format.extension === 'mp4' ? 'video/mp4' : 'video/webm') }));
        recorder.start(1000);
      }).catch((error) => reject(error instanceof Error ? error : new Error('Falha ao iniciar reprodução para compressão.')));
    });
    const blob = await done;
    await audioContext?.close().catch(() => undefined);
    if (!blob.size) throw new Error(`Compressão ${profile} gerou arquivo vazio.`);
    const compressedDuration = await readDuration(blob);
    if (originalDuration && compressedDuration && compressedDuration < originalDuration * MIN_DURATION_RATIO) throw new Error(`Compressão ${profile} encurtou o vídeo.`);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    debug('blob generated', { profile, format: format.label, mimeType: format.mimeType, size: blob.size, originalWidth, originalHeight, targetWidth, targetHeight });
    return new File([blob], `${baseName}.${format.extension}`, { type: blob.type || (format.extension === 'mp4' ? 'video/mp4' : 'video/webm'), lastModified: Date.now() });
  });
}

export async function compressVideoForUpload(file: File, options: CompressOptions): Promise<File> {
  if (!options.enabled) return file;
  if (file.size < MIN_SIZE_FOR_COMPRESSION && options.profile === 'auto') return file;
  if (typeof window === 'undefined') return file;
  if (typeof MediaRecorder === 'undefined') throw new Error('Este navegador não suporta compressão local com MediaRecorder.');
  if (typeof HTMLCanvasElement === 'undefined') throw new Error('Este navegador não suporta compressão local com Canvas.');
  if (!supportedFormat()) throw new Error('Este navegador não suporta saída de vídeo para compressão local.');
  const plan = compressionPlan(options.profile, file.size);
  let best = file; let bestScore = Number.NEGATIVE_INFINITY; let lastError: unknown = null;
  debug('plan', { file: file.name, size: file.size, selectedProfile: options.profile, format: supportedFormat()?.label, plan });
  for (let index = 0; index < plan.length; index += 1) {
    const profile = plan[index];
    try {
      const candidate = await compressOnce(file, profile, options, index, plan.length);
      const floor = qualityFloorFor(profile, file.size);
      const candidateScore = scoreCandidate(file, candidate, profile);
      debug('candidate', { profile, type: candidate.type, name: candidate.name, size: candidate.size, floor, candidateScore });
      if (candidate.size < file.size && candidateScore > bestScore) { best = candidate; bestScore = candidateScore; }
      if (candidate.size <= DIRECT_UPLOAD_SAFE_LIMIT && (!floor || candidate.size >= floor)) { options.onProgress?.(100, `Vídeo comprimido para envio direto (${formatCompression(file.size, candidate.size)})`); return candidate; }
    } catch (error) { lastError = error; debug('profile failed', profile, error); options.onProgress?.(Math.min(99, Math.round(((index + 1) / plan.length) * 100)), `Compressão ${profile} falhou, tentando próximo perfil...`); }
  }
  if (best.size < file.size) { options.onProgress?.(100, `Melhor compressão possível (${formatCompression(file.size, best.size)})`); return best; }
  if (lastError) throw new Error(`Não foi possível comprimir este vídeo no navegador: ${lastError instanceof Error ? lastError.message : 'compressão local falhou'}`);
  return file;
}

function formatCompression(original: number, compressed: number) { return `${Math.max(0, Math.round((1 - compressed / original) * 100))}% menor`; }
