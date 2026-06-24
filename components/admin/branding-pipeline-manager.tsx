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
.branding-pipeline{grid-column:1/-1;border:1px solid rgba(255,255,255,.12)!important;border-radius:28px!important;background:linear-gradient(145deg,rgba(19,22,28,.94),rgba(8,9,13,.96))!important;padding:26px!important;box-shadow:0 32px 90px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.06)!important}.branding-pipeline *{box-sizing:border-box}.branding-pipeline-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:22px!important;margin-bottom:18px!important}.branding-pipeline-kicker{display:flex!important;align-items:center!important;gap:8px!important;margin:0 0 10px!important;text-transform:uppercase!important;letter-spacing:.28em!important;color:#f6c75c!important;font-size:12px!important;font-weight:950!important}.branding-pipeline-title{margin:0!important;color:#fff!important;font-size:28px!important;letter-spacing:-.04em!important}.branding-pipeline-sub{margin:7px 0 0!important;color:rgba(248,247,251,.66)!important;line-height:1.5!important}.branding-pipeline-actions{display:flex!important;gap:12px!important;flex-wrap:wrap!important}.branding-btn{appearance:none!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:13px!important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.035))!important;color:#fff!important;padding:11px 15px!important;font-weight:900!important;cursor:pointer!important;text-align:center!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;line-height:1.1!important;transition:.18s ease!important;white-space:nowrap!important;font-size:14px!important}.branding-btn:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.26)!important}.branding-btn.gold{background:rgba(246,199,92,.13)!important;border-color:rgba(246,199,92,.55)!important;color:#ffd978!important}.branding-btn.danger{background:rgba(255,86,86,.1)!important;border-color:rgba(255,86,86,.32)!important;color:#ff8585!important}.branding-btn:disabled{opacity:.45!important;cursor:not-allowed!important;transform:none!important}.branding-hidden{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}.branding-tip{display:grid!important;grid-template-columns:auto 1fr!important;gap:16px!important;align-items:center!important;border:1px solid rgba(246,199,92,.28)!important;border-left:3px solid #f6c75c!important;border-radius:16px!important;background:linear-gradient(135deg,rgba(246,199,92,.09),rgba(255,255,255,.025))!important;padding:16px 18px!important;margin:14px 0 20px!important}.branding-tip-icon{width:42px!important;height:42px!important;border-radius:14px!important;display:grid!important;place-items:center!important;color:#ffd978!important;font-size:25px!important;background:rgba(246,199,92,.1)!important}.branding-tip strong{display:block!important;color:#ffd978!important;margin-bottom:4px!important}.branding-tip p{margin:0!important;color:rgba(248,247,251,.67)!important}.branding-status{margin-top:12px!important;border-radius:14px!important;padding:12px 14px!important;font-size:13px!important}.branding-status.ok{border:1px solid rgba(74,222,128,.22)!important;background:rgba(74,222,128,.1)!important;color:#bbf7d0!important}.branding-status.bad{border:1px solid rgba(248,113,113,.24)!important;background:rgba(248,113,113,.1)!important;color:#fecaca!important}.branding-assets-list{display:grid!important;gap:10px!important}.branding-asset-row{display:grid!important;grid-template-columns:260px 1.2fr 260px auto!important;gap:18px!important;align-items:center!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:16px!important;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.018))!important;padding:12px 16px!important}.branding-preview-media{height:112px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:12px!important;background:radial-gradient(circle at 70% 15%,rgba(246,199,92,.12),transparent 44%),#07080b!important;overflow:hidden!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:8px!important}.branding-preview-media.square{width:94px!important;height:94px!important;margin:auto!important}.branding-preview-media.portrait{width:160px!important;margin:auto!important}.branding-preview-media.banner,.branding-preview-media.og,.branding-preview-media.wide{width:100%!important}.branding-preview-media img{width:100%!important;height:100%!important;object-fit:contain!important;border-radius:8px!important;display:block!important}.branding-preview-media.banner img,.branding-preview-media.og img,.branding-preview-media.portrait img{object-fit:cover!important}.branding-preview-media span{font-size:12px!important;color:rgba(248,247,251,.45)!important}.branding-asset-info h3{margin:0!important;color:#fff!important;font-size:18px!important;display:flex!important;align-items:center!important;gap:10px!important}.branding-premium-pill{display:inline-flex!important;align-items:center!important;gap:5px!important;border-radius:999px!important;background:rgba(246,199,92,.12)!important;color:#ffd978!important;padding:4px 9px!important;font-size:12px!important;font-weight:900!important}.branding-asset-info p{margin:7px 0 0!important;color:rgba(248,247,251,.64)!important;line-height:1.35!important}.branding-asset-info small{display:block!important;margin-top:7px!important;color:#62f089!important;font-weight:900!important}.branding-size-control{border-left:1px solid rgba(255,255,255,.08)!important;padding-left:18px!important}.branding-size-control span{display:block!important;color:rgba(248,247,251,.58)!important;font-size:12px!important;margin-bottom:8px!important}.branding-size-inputs{display:flex!important;align-items:center!important;gap:9px!important}.branding-size-inputs input{width:82px!important;height:36px!important;border-radius:9px!important;border:1px solid rgba(255,255,255,.13)!important;background:rgba(0,0,0,.24)!important;color:#fff!important;padding:0 10px!important;outline:0!important}.branding-size-inputs em{color:rgba(248,247,251,.55)!important;font-style:normal!important}.branding-row-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:10px!important;flex-wrap:wrap!important}.branding-field-grid{display:grid!important;grid-template-columns:1fr 1fr auto!important;gap:14px!important;margin-top:18px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:16px!important;background:rgba(0,0,0,.16)!important;padding:14px!important}.branding-field-grid label{display:grid!important;gap:7px!important;color:rgba(248,247,251,.6)!important;font-size:12px!important;font-weight:800!important}.branding-field-grid input{height:46px!important;border-radius:12px!important;border:1px solid rgba(255,255,255,.13)!important;background:rgba(0,0,0,.22)!important;color:#fff!important;padding:0 14px!important;outline:0!important}.branding-save{display:flex!important;align-items:end!important}.branding-save button{height:46px!important;min-width:210px!important}@media(max-width:1180px){.branding-asset-row{grid-template-columns:210px 1fr!important}.branding-size-control{border-left:0!important;padding-left:0!important}.branding-row-actions{justify-content:flex-start!important}.branding-field-grid{grid-template-columns:1fr 1fr!important}}@media(max-width:760px){.branding-pipeline{padding:18px!important}.branding-pipeline-head{display:grid!important}.branding-pipeline-actions,.branding-row-actions{display:grid!important}.branding-btn{width:100%!important}.branding-asset-row{grid-template-columns:1fr!important}.branding-preview-media,.branding-preview-media.portrait,.branding-preview-media.square{width:100%!important;height:130px!important}.branding-field-grid{grid-template-columns:1fr!important}.branding-save button{width:100%!important}}
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
    <>
      <style dangerouslySetInnerHTML={{ __html: brandingPipelineCss }} />
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
    </>
  );
}
