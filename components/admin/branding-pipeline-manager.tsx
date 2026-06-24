"use client";

import { useMemo, useState } from 'react';

type AssetKey = 'logo' | 'favicon' | 'login' | 'hero' | 'og';
type BrandingState = { logoUrl: string; faviconUrl: string; loginImageUrl: string; heroImageUrl: string; ogImageUrl: string };
type Asset = { key: AssetKey; label: string; width: number; height: number; field: keyof BrandingState; mimeType: 'image/webp' | 'image/png'; fit: 'cover' | 'contain'; quality?: number; format: string; ratioClass: string };
type SizeMap = Record<AssetKey, { width: number; height: number }>;

const ASSETS: Asset[] = [
  { key: 'logo', label: 'Logo principal', width: 1200, height: 360, field: 'logoUrl', mimeType: 'image/webp', fit: 'contain', quality: 0.92, format: 'PNG ou WebP', ratioClass: 'wide' },
  { key: 'favicon', label: 'Favicon', width: 512, height: 512, field: 'faviconUrl', mimeType: 'image/png', fit: 'contain', format: 'PNG', ratioClass: 'square' },
  { key: 'login', label: 'Imagem de login', width: 1200, height: 1600, field: 'loginImageUrl', mimeType: 'image/webp', fit: 'cover', quality: 0.9, format: 'JPG ou PNG', ratioClass: 'portrait' },
  { key: 'hero', label: 'Hero / Banner', width: 1920, height: 900, field: 'heroImageUrl', mimeType: 'image/webp', fit: 'cover', quality: 0.9, format: 'JPG ou PNG', ratioClass: 'banner' },
  { key: 'og', label: 'Open Graph', width: 1200, height: 630, field: 'ogImageUrl', mimeType: 'image/webp', fit: 'cover', quality: 0.9, format: 'JPG ou PNG', ratioClass: 'og' },
];

const EMPTY: BrandingState = { logoUrl: '', faviconUrl: '', loginImageUrl: '', heroImageUrl: '', ogImageUrl: '' };
const INITIAL_SIZES: SizeMap = ASSETS.reduce((acc, asset) => ({ ...acc, [asset.key]: { width: asset.width, height: asset.height } }), {} as SizeMap);

export const brandingPipelineCss = `
.branding-pipeline{grid-column:1/-1;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:linear-gradient(145deg,rgba(19,22,28,.94),rgba(8,9,13,.96));padding:26px;box-shadow:0 32px 90px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.06)}.branding-pipeline-head{display:flex;align-items:flex-start;justify-content:space-between;gap:22px;margin-bottom:18px}.branding-pipeline-kicker{display:flex;align-items:center;gap:8px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.28em;color:#f6c75c;font-size:12px;font-weight:950}.branding-pipeline-title{margin:0;color:#fff;font-size:28px;letter-spacing:-.04em}.branding-pipeline-sub{margin:7px 0 0;color:rgba(248,247,251,.66);line-height:1.5}.branding-pipeline-actions{display:flex;gap:12px;flex-wrap:wrap}.branding-btn{border:1px solid rgba(255,255,255,.14);border-radius:13px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.035));color:#fff;padding:11px 15px;font-weight:900;cursor:pointer;text-align:center;display:inline-flex;align-items:center;justify-content:center;gap:8px;line-height:1.1;transition:.18s ease;white-space:nowrap}.branding-btn:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.26)}.branding-btn.gold{background:rgba(246,199,92,.13);border-color:rgba(246,199,92,.55);color:#ffd978}.branding-btn.danger{background:rgba(255,86,86,.1);border-color:rgba(255,86,86,.32);color:#ff8585}.branding-btn.cyan{background:rgba(76,220,255,.09);border-color:rgba(76,220,255,.28);color:#70e7ff}.branding-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}.branding-hidden{display:none}.branding-tip{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;border:1px solid rgba(246,199,92,.28);border-left:3px solid #f6c75c;border-radius:16px;background:linear-gradient(135deg,rgba(246,199,92,.09),rgba(255,255,255,.025));padding:16px 18px;margin:14px 0 20px}.branding-tip-icon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;color:#ffd978;font-size:25px;background:rgba(246,199,92,.1)}.branding-tip strong{display:block;color:#ffd978;margin-bottom:4px}.branding-tip p{margin:0;color:rgba(248,247,251,.67)}.branding-status{margin-top:12px;border-radius:14px;padding:12px 14px;font-size:13px}.branding-status.ok{border:1px solid rgba(74,222,128,.22);background:rgba(74,222,128,.1);color:#bbf7d0}.branding-status.bad{border:1px solid rgba(248,113,113,.24);background:rgba(248,113,113,.1);color:#fecaca}.branding-assets-list{display:grid;gap:10px}.branding-asset-row{display:grid;grid-template-columns:260px 1.2fr 260px auto;gap:18px;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.018));padding:12px 16px}.branding-preview-media{height:112px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:radial-gradient(circle at 70% 15%,rgba(246,199,92,.12),transparent 44%),#07080b;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:8px}.branding-preview-media.square{width:94px;height:94px;margin:auto}.branding-preview-media.portrait{width:160px;margin:auto}.branding-preview-media.banner,.branding-preview-media.og,.branding-preview-media.wide{width:100%}.branding-preview-media img{width:100%;height:100%;object-fit:contain;border-radius:8px}.branding-preview-media.banner img,.branding-preview-media.og img,.branding-preview-media.portrait img{object-fit:cover}.branding-preview-media span{font-size:12px;color:rgba(248,247,251,.45)}.branding-asset-info h3{margin:0;color:#fff;font-size:18px;display:flex;align-items:center;gap:10px}.branding-premium-pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:rgba(246,199,92,.12);color:#ffd978;padding:4px 9px;font-size:12px;font-weight:900}.branding-asset-info p{margin:7px 0 0;color:rgba(248,247,251,.64);line-height:1.35}.branding-asset-info small{display:block;margin-top:7px;color:#62f089;font-weight:900}.branding-size-control{border-left:1px solid rgba(255,255,255,.08);padding-left:18px}.branding-size-control span{display:block;color:rgba(248,247,251,.58);font-size:12px;margin-bottom:8px}.branding-size-inputs{display:flex;align-items:center;gap:9px}.branding-size-inputs input{width:82px;height:36px;border-radius:9px;border:1px solid rgba(255,255,255,.13);background:rgba(0,0,0,.24);color:#fff;padding:0 10px;outline:0}.branding-size-inputs em{color:rgba(248,247,251,.55);font-style:normal}.branding-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}.branding-field-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:14px;margin-top:18px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(0,0,0,.16);padding:14px}.branding-field-grid label{display:grid;gap:7px;color:rgba(248,247,251,.6);font-size:12px;font-weight:800}.branding-field-grid input{height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.13);background:rgba(0,0,0,.22);color:#fff;padding:0 14px;outline:0}.branding-color-input{display:flex;align-items:center;gap:12px;height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.13);background:rgba(0,0,0,.22);padding:0 12px}.branding-color-input i{width:30px;height:30px;border-radius:7px;background:#d4af37;box-shadow:0 0 18px rgba(212,175,55,.28)}.branding-save{display:flex;align-items:end}.branding-save button{height:46px;min-width:210px}@media(max-width:1180px){.branding-asset-row{grid-template-columns:210px 1fr}.branding-size-control{border-left:0;padding-left:0}.branding-row-actions{justify-content:flex-start}.branding-field-grid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.branding-pipeline{padding:18px}.branding-pipeline-head{display:grid}.branding-pipeline-actions,.branding-row-actions{display:grid}.branding-btn{width:100%}.branding-asset-row{grid-template-columns:1fr}.branding-preview-media,.branding-preview-media.portrait,.branding-preview-media.square{width:100%;height:130px}.branding-field-grid{grid-template-columns:1fr}.branding-save button{width:100%}}
`;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível carregar a imagem.')); };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem otimizada.')), mimeType, quality));
}

function drawAsset(image: HTMLImageElement, asset: Asset, size: { width: number; height: number }) {
  const width = Math.max(64, Math.round(size.width || asset.width));
  const height = Math.max(64, Math.round(size.height || asset.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  ctx.clearRect(0, 0, width, height);
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = asset.fit === 'cover' ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
  return canvas;
}

async function uploadAsset(asset: Asset, blob: Blob) {
  const extension = asset.mimeType === 'image/png' ? 'png' : 'webp';
  const form = new FormData();
  form.append('asset', asset.key);
  form.append('file', new File([blob], `${asset.key}.${extension}`, { type: asset.mimeType }));
  const response = await fetch('/api/admin/branding-upload', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `Falha ao enviar ${asset.label}.`);
  return data.url as string;
}

export function BrandingPipelineManager({ initial }: { initial: BrandingState }) {
  const [values, setValues] = useState<BrandingState>(initial);
  const [sizes, setSizes] = useState<SizeMap>(INITIAL_SIZES);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => ASSETS.map((asset) => ({ ...asset, url: values[asset.field], size: sizes[asset.key] })), [values, sizes]);

  async function generate(file: File, onlyAsset?: Asset) {
    try {
      setLoading(true);
      setError(null);
      const image = await loadImage(file);
      const next = { ...values };
      for (const asset of onlyAsset ? [onlyAsset] : ASSETS) {
        const size = sizes[asset.key];
        setMessage(`Gerando ${asset.label} (${size.width}x${size.height})...`);
        const canvas = drawAsset(image, asset, size);
        const blob = await canvasToBlob(canvas, asset.mimeType, asset.quality);
        next[asset.field] = await uploadAsset(asset, blob);
      }
      setValues(next);
      setMessage(onlyAsset ? `${onlyAsset.label} atualizado. Agora clique em Salvar alterações.` : 'Pipeline concluído. Agora clique em Salvar alterações.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar identidade visual.');
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }

  function updateSize(key: AssetKey, field: 'width' | 'height', value: string) {
    const numeric = Math.max(64, Math.min(4000, Number(value) || 64));
    setSizes((current) => ({ ...current, [key]: { ...current[key], [field]: numeric } }));
  }

  function clearAsset(asset: Asset) {
    setValues((current) => ({ ...current, [asset.field]: '' }));
    setMessage(`${asset.label} removido. Clique em Salvar alterações.`);
    setError(null);
  }

  return (
    <div className="branding-pipeline">
      <input type="hidden" name="logoUrl" value={values.logoUrl} />
      <input type="hidden" name="faviconUrl" value={values.faviconUrl} />
      <input type="hidden" name="loginImageUrl" value={values.loginImageUrl} />
      <input type="hidden" name="heroImageUrl" value={values.heroImageUrl} />
      <input type="hidden" name="ogImageUrl" value={values.ogImageUrl} />
      <div className="branding-pipeline-head">
        <div>
          <p className="branding-pipeline-kicker">◇ Premium</p>
          <h2 className="branding-pipeline-title">Identidade visual premium</h2>
          <p className="branding-pipeline-sub">Gerencie os ativos visuais do Hub. Use uma imagem matriz ou envie cada formato separadamente.</p>
        </div>
        <div className="branding-pipeline-actions">
          <label className="branding-btn gold">↥ {loading ? 'Processando...' : 'Subir imagem matriz'}<input type="file" accept="image/png,image/jpeg,image/webp" className="branding-hidden" disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void generate(file); }} /></label>
          <button type="button" onClick={() => { setValues(EMPTY); setMessage('Uploads removidos. Clique em Salvar alterações.'); }} disabled={loading} className="branding-btn danger">⌫ Remover tudo</button>
        </div>
      </div>
      <div className="branding-tip"><span className="branding-tip-icon">✧</span><div><strong>Dica premium</strong><p>Edite o tamanho antes de subir a imagem matriz para gerar automaticamente todos os formatos nas dimensões desejadas.</p></div></div>
      {message ? <p className="branding-status ok">{message}</p> : null}
      {error ? <p className="branding-status bad">{error}</p> : null}
      <div className="branding-assets-list">
        {previews.map((asset) => (
          <div key={asset.key} className="branding-asset-row">
            <div className={`branding-preview-media ${asset.ratioClass}`}>{asset.url ? <img src={asset.url} alt={asset.label} /> : <span>Sem imagem</span>}</div>
            <div className="branding-asset-info"><h3>{asset.label} <span className="branding-premium-pill">◇ Premium</span></h3><p>Recomendado: {asset.width}x{asset.height}px<br />{asset.format}</p><small>◎ {asset.url ? 'Ativo' : 'Aguardando upload'}</small></div>
            <div className="branding-size-control"><span>Tamanho atual</span><div className="branding-size-inputs"><input type="number" value={asset.size.width} min={64} max={4000} onChange={(e) => updateSize(asset.key, 'width', e.target.value)} /><em>x</em><input type="number" value={asset.size.height} min={64} max={4000} onChange={(e) => updateSize(asset.key, 'height', e.target.value)} /><em>px</em></div></div>
            <div className="branding-row-actions"><label className="branding-btn">↥ Upload específico<input type="file" accept="image/png,image/jpeg,image/webp" className="branding-hidden" disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void generate(file, asset); }} /></label><button type="button" onClick={() => clearAsset(asset)} disabled={loading || !asset.url} className="branding-btn danger">⌫ Remover</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
