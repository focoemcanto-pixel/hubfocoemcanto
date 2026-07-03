import { ImageResponse } from 'next/og';
import { getAdminSettings } from '@/lib/data/admin-settings';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
  const settings = await getAdminSettings();
  const b = settings.branding;
  const color = b.primaryColor || '#D4AF37';
  const letter = (b.appName || 'F').trim().charAt(0).toUpperCase();
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#050506,#14110a)', borderRadius: 36, color, fontSize: 92, fontWeight: 900, fontFamily: 'Arial', border: `9px solid ${color}` }}>{letter}</div>,
    { ...size }
  );
}
