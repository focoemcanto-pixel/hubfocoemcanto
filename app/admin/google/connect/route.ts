import { NextResponse } from 'next/server';
import { driveRedirectUri } from '@/lib/google/drive-utils';

export async function GET() {
  const params = new URLSearchParams();
  params.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
  params.set('redirect_uri', driveRedirectUri());
  params.set('response_type', 'code');
  params.set('access_type', 'offline');
  params.set('prompt', 'consent');
  params.set('include_granted_scopes', 'true');
  params.set('scope', 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly');

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  return NextResponse.redirect(url);
}
