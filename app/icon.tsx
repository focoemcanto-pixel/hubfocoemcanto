import { ImageResponse } from 'next/og';
import { getAdminSettings } from '@/lib/data/admin-settings';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default async function Icon() {
  const settings = await getAdminSettings();
  const b = settings.branding;
  const color = b.primaryColor || '#D4AF37';
  const letter = (b.appName || 'F').trim().charAt(0).toUpperCase();
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050506', borderRadius: 14, border: `4px solid ${color}`, color, fontSize: 34, fontWeight: 900, fontFamily: 'Arial' }}>{letter}</div>,
    { ...size }
  );
}
