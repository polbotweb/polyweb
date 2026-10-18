/** Helpers des écrans d'administration « Plateforme ». */
import type { AstroGlobal } from "astro";
import { auth } from "@/lib/auth";
import { ensureDefaultSite, getSiteById, type Site } from "@/modules/sites/domain/sites";
import type { FieldDefinition } from "@/core/content-types/fields";

export const ADMIN_SITE_COOKIE = "pw_admin_site";

/** Site administré : cookie de sélection (écran Sites) sinon site résolu par Host, sinon défaut. */
export async function getAdminSite(Astro: Pick<AstroGlobal, "cookies" | "locals">): Promise<Site> {
  const chosen = Astro.cookies.get(ADMIN_SITE_COOKIE)?.value;
  if (chosen) {
    const s = await getSiteById(chosen).catch(() => undefined);
    if (s) return s;
  }
  return Astro.locals.site ?? (await ensureDefaultSite());
}

export async function userCan(userId: string, permissions: Record<string, string[]>): Promise<boolean> {
  const r = await auth.api.userHasPermission({ body: { userId, permissions } });
  return !!r.success;
}

/** Lit les valeurs d'un FormData pour une liste de champs, préfixe `${prefix}__`. */
export function readFieldValues(form: FormData, fields: readonly FieldDefinition[], prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const key = `${prefix}__${f.name}`;
    if (f.type === "multiselect") out[f.name] = form.getAll(key).map(String);
    else if (f.type === "boolean") out[f.name] = form.get(key) === "on" || form.get(key) === "true";
    else if (f.type === "relation" && f.multiple) out[f.name] = form.getAll(key).map(String).filter(Boolean);
    else if (f.type === "json") {
      const raw = String(form.get(key) ?? "").trim();
      try { out[f.name] = raw ? JSON.parse(raw) : undefined; } catch { out[f.name] = raw; }
    } else {
      const v = form.get(key);
      out[f.name] = v === null ? undefined : String(v);
    }
  }
  return out;
}

export function formatDate(d: Date | string | null | undefined, locale: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
