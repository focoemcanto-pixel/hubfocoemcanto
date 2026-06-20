import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const url = new URL('/admin/biblioteca', request.url);
  url.searchParams.set('erro', 'use-modulo-primeiro');
  return NextResponse.redirect(url);
}
