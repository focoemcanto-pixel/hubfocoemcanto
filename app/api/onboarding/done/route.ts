import { NextResponse } from 'next/server';

function doneResponse(request: Request) {
  const response = NextResponse.json({ ok: true });
  const secure = request.url.startsWith('https://');
  response.cookies.set('hub_onboarding_done', '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set('hub_onboarding_status', 'done', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set('hub_onboarding_step', 'done', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export async function POST(request: Request) {
  return doneResponse(request);
}

export async function GET(request: Request) {
  return doneResponse(request);
}
