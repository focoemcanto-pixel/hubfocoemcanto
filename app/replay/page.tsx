import { notFound } from 'next/navigation';
import ReplayView from './replay-view';
import { getReplayBySlug, getReplayProducts } from '@/lib/live-replays';
import './replay.css';

export const dynamic = 'force-dynamic';

export default async function CurrentReplayPage() {
  const [replay, products] = await Promise.all([getReplayBySlug(), getReplayProducts()]);
  if (!replay) notFound();
  return <ReplayView replay={replay} products={products} />;
}
