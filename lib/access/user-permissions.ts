import { courseKeyFromProduct, isAccessActive, normalizeCourseKey } from './products';

type ProfileLike = { role?: string | null; email?: string | null } | null | undefined;
type SubscriptionLike = { course_key?: string | null; product_name?: string | null; status?: string | null } | null | undefined;

const ADMIN_EMAILS = new Set([
  'markuezemarquinhos@hotmail.com',
  'focoemcanto@gmail.com',
]);

export function isAdminProfile(profile?: ProfileLike) {
  const role = String(profile?.role || '').toLowerCase().trim();
  const email = String(profile?.email || '').toLowerCase().trim();
  return role === 'admin' || ADMIN_EMAILS.has(email);
}

export function isVipSubscription(sub?: SubscriptionLike) {
  if (!sub || !isAccessActive(sub.status)) return false;
  const key = normalizeCourseKey(sub.course_key);
  if (key === 'grupo-vip') return true;
  return courseKeyFromProduct(sub.product_name) === 'grupo-vip';
}

export function hasVipAccess(profile?: ProfileLike, subscriptions: SubscriptionLike[] = []) {
  return isAdminProfile(profile) || subscriptions.some(isVipSubscription);
}

export function hasFullSchoolAccess(profile?: ProfileLike, subscriptions: SubscriptionLike[] = []) {
  return hasVipAccess(profile, subscriptions);
}
