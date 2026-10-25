/// <reference path="../.astro/types.d.ts" />

type Auth = typeof import("./lib/auth").auth;
type Session = Auth["$Infer"]["Session"];

declare namespace App {
  interface Locals {
    user: Session["user"] | null;
    session: (Session["session"] & { impersonatedBy?: string | null }) | null;
    /** Site résolu depuis l'en-tête Host (multi-site, brique j). null si la base est indisponible. */
    site: import("./modules/sites/domain/sites").Site | null;
  }
}
