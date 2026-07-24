import { notFound } from 'next/navigation';
import ReplayView from '../replay-view';
import { getReplayBySlug, getReplayProducts } from '@/lib/live-replays';
import '../replay.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export default async function ReplayBySlugPage({ params }: Props) {
  const { slug } = await params;
  const [replay, products] = await Promise.all([getReplayBySlug(slug), getReplayProducts()]);
  if (!replay) notFound();
  return <ReplayView replay={replay} products={products} />;
}
