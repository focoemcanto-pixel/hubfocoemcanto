import { NextResponse } from 'next/server';

const ALLOWED_STEPS = new Set(['welcome', 'vocal', 'profile', 'tour', 'duet', 'record', 'done']);
const ALLOWED_STATUS = new Set(['in_progress', 'later', 'done']);

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const step = ALLOWED_STEPS.has(String(body.step)) ? String(body.step) : 'welcome';
  const status = ALLOWED_STATUS.has(String(body.status)) ? String(body.status) : 'in_progress';
  const response = NextResponse.json({ ok: true, step, status });
  const secure = request.url.startsWith('https://');
  response.cookies.set('hub_onboarding_step', step, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 365 });
  response.cookies.set('hub_onboarding_status', status, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 365 });
  if (status === 'done') {
    response.cookies.set('hub_onboarding_done', '1', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}
