import { NextResponse } from 'next/server';

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/images/duet-video-placeholder-mic.png', request.url));
}
