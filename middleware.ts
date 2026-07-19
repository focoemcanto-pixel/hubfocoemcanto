import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const accessEmail = request.cookies.get('hub_access_email')?.value;

  if (!accessEmail && (path.startsWith('/aluno') || path.startsWith('/admin'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/aluno/:path*', '/admin/:path*'],
};
