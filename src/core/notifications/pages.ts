/**
 * Pages « Mes notifications » et « Préférences de notification » (N7-A) : session requise,
 * données limitées à l'utilisateur connecté, formulaires POST même origine (PRG, sans JavaScript).
 */
import type { AstroGlobal } from "astro";
import { requireAuth } from "@/lib/auth-guards";
import { runApp } from "@/lib/effect/http";
import { listNotificationCategories, NOTIFICATION_CHANNELS, type NotificationChannel } from "./registry";
import { listNotificationPreferences, listNotifications, markNotificationsRead, setNotificationPreference, unreadNotificationCount } from "./service";

export const NOTIFICATIONS_PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const privateHeaders = (Astro: AstroGlobal) => {
  Astro.response.headers.set("cache-control", "private, no-store");
  Astro.response.headers.set("x-robots-tag", "noindex, nofollow");
};

export const notificationsPath = (locale: string, opts: { unread?: boolean; page?: number } = {}) => {
  const q = new URLSearchParams();
  if (opts.unread) q.set("filter", "unread");
  if (opts.page && opts.page > 1) q.set("page", String(opts.page));
  const s = q.toString();
  return `/${locale}/notifications${s ? `?${s}` : ""}`;
};

export async function notificationsPage(Astro: AstroGlobal) {
  const guard = await requireAuth(Astro);
  if ("redirect" in guard) return { redirect: guard.redirect };
  privateHeaders(Astro);
  const scope = { userId: guard.user.id };
  const unreadOnly = Astro.url.searchParams.get("filter") === "unread";
  const page = Math.min(1000, Math.max(1, Number.parseInt(Astro.url.searchParams.get("page") ?? "1", 10) || 1));
  if (Astro.request.method === "POST") {
    const form = await Astro.request.formData();
    const id = form.get("id");
    if (form.get("intent") === "read-all") await runApp(markNotificationsRead(scope));
    else if (typeof id === "string" && UUID.test(id)) await runApp(markNotificationsRead(scope, [id]));
    return { redirect: Astro.redirect(notificationsPath(guard.locale, { unread: unreadOnly, page }), 303) };
  }
  const unread = await runApp(unreadNotificationCount(scope));
  const items = await runApp(listNotifications(scope, { page, limit: NOTIFICATIONS_PAGE_SIZE, unreadOnly }));
  // Sonde d'une ligne pour savoir s'il existe une page suivante.
  const nextProbe = items.length === NOTIFICATIONS_PAGE_SIZE ? await runApp(listNotifications(scope, { page: page * NOTIFICATIONS_PAGE_SIZE + 1, limit: 1, unreadOnly })) : [];
  return { locale: guard.locale, user: guard.user, authT: guard.authT, items, unread, unreadOnly, page, hasNext: nextProbe.length > 0 };
}

export interface PreferenceRow {
  readonly category: string;
  readonly channels: readonly { channel: NotificationChannel; enabled: boolean }[];
}

export async function preferencesPage(Astro: AstroGlobal) {
  const guard = await requireAuth(Astro);
  if ("redirect" in guard) return { redirect: guard.redirect };
  privateHeaders(Astro);
  const categories = listNotificationCategories();
  if (Astro.request.method === "POST") {
    const form = await Astro.request.formData();
    for (const { category, channels } of categories) {
      for (const channel of channels) await runApp(setNotificationPreference(guard.user.id, category, channel, form.get(`${category}:${channel}`) === "on"));
    }
    return { redirect: Astro.redirect(`/${guard.locale}/notifications/preferences?saved=1`, 303) };
  }
  const prefs = await runApp(listNotificationPreferences(guard.user.id));
  const enabled = (category: string, channel: NotificationChannel) => prefs.find((p) => p.category === category && p.channel === channel)?.enabled ?? true;
  const rows: PreferenceRow[] = categories.map(({ category, channels }) => ({
    category,
    channels: NOTIFICATION_CHANNELS.filter((c) => channels.includes(c)).map((channel) => ({ channel, enabled: enabled(category, channel) })),
  }));
  return { locale: guard.locale, user: guard.user, authT: guard.authT, rows, saved: Astro.url.searchParams.get("saved") === "1" };
}
