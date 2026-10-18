/// <reference path="../.astro/types.d.ts" />

type Auth = typeof import("./lib/auth").auth;
type Session = Auth["$Infer"]["Session"];

declare namespace App {
  interface Locals {
    user: Session["user"] | null;
    session: (Session["session"] & { impersonatedBy?: string | null }) | null;
  }
}
