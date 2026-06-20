import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith('/aluno') || path.startsWith('/admin'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user?.email && path.startsWith('/aluno')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, subscriptions(status)')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();

    const subscriptions = Array.isArray(profile?.subscriptions) ? profile?.subscriptions : [];
    const isActive = subscriptions.some((subscription) => subscription.status === 'active');

    if (!isActive) {
      const url = request.nextUrl.clone();
      url.pathname = '/acesso-bloqueado';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/aluno/:path*', '/admin/:path*'],
};
