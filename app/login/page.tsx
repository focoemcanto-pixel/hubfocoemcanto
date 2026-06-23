import { redirect } from 'next/navigation';

type LoginSearch = { email?: string; setup?: string; password?: string; erro?: string };

export default async function LoginRedirect({ searchParams }: { searchParams?: Promise<LoginSearch> }) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });

  redirect(query.size ? `/?${query.toString()}` : '/');
}
