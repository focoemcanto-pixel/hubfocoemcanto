export function drawCoverFrame(
  ctx: CanvasRenderingContext2D,
  media: HTMLVideoElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const videoWidth = media.videoWidth || width;
  const videoHeight = media.videoHeight || height;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (videoWidth - sourceWidth) / 2;
  const sourceY = (videoHeight - sourceHeight) / 2;
  ctx.drawImage(media, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

export function drawDuetCanvasFrame(
  canvas: HTMLCanvasElement | null,
  reference: HTMLVideoElement | null,
  camera: HTMLVideoElement | null,
) {
  if (!canvas || !reference || !camera) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const half = width / 2;

  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);
  if (reference.readyState >= 2 && reference.videoWidth > 0) drawCoverFrame(ctx, reference, 0, 0, half, height);
  if (camera.readyState >= 2 && camera.videoWidth > 0) drawCoverFrame(ctx, camera, half, 0, half, height);

  ctx.fillStyle = 'rgba(0,0,0,.46)';
  ctx.fillRect(0, 0, width, 54);
  ctx.fillStyle = '#fff';
  ctx.font = '700 22px Arial';
  ctx.fillText('Referência', 24, 35);
  ctx.fillText('Você', half + 24, 35);
  ctx.strokeStyle = 'rgba(245,199,107,.58)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half, height);
  ctx.stroke();
}
