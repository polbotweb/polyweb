/**
 * Page publique de désinscription (lien signé `?token=`, N5-A) : GET affiche la confirmation,
 * POST (formulaire même origine) désactive le canal de la catégorie. Jamais en cache ni indexée.
 */
import type { AstroGlobal } from "astro";
import { Effect } from "effect";
import { toLocale } from "@i18n/utils";
import { AppConfig } from "@/lib/effect/config";
import { runApp } from "@/lib/effect/http";
import { setNotificationPreference } from "./service";
import { verifyUnsubscribeToken, type UnsubscribeClaims } from "./unsubscribe";

export type UnsubscribeState = "confirm" | "done" | "invalid";

const claimsOf = (token: string) => AppConfig.use((config) => Effect.succeed<UnsubscribeClaims | null>(verifyUnsubscribeToken(token, config.signingSecret)));

export async function unsubscribePage(Astro: AstroGlobal) {
  const locale = toLocale(Astro.params.lang);
  Astro.response.headers.set("cache-control", "private, no-store");
  Astro.response.headers.set("x-robots-tag", "noindex, nofollow");
  let token = Astro.url.searchParams.get("token") ?? "";
  if (Astro.request.method === "POST") {
    const value = (await Astro.request.formData()).get("token");
    token = typeof value === "string" && value ? value : token;
  }
  const claims = token ? await runApp(claimsOf(token)) : null;
  if (!claims) {
    Astro.response.status = 400;
    return { locale, token: "", category: "", state: "invalid" as UnsubscribeState };
  }
  if (Astro.request.method === "POST") {
    await runApp(setNotificationPreference(claims.userId, claims.category, claims.channel, false));
    return { locale, token: "", category: claims.category, state: "done" as UnsubscribeState };
  }
  return { locale, token, category: claims.category, state: "confirm" as UnsubscribeState };
}
