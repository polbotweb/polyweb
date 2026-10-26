/** Erreurs typées du rendu de documents (PDF). */
import { Data } from "effect";

/** `unavailable` : aucun moteur configuré / Chromium introuvable ; `timeout` : rendu trop long ; `render` : échec du moteur. */
export class DocumentRenderError extends Data.TaggedError("DocumentRenderError")<{
  readonly reason: "unavailable" | "timeout" | "render";
  readonly cause?: unknown;
}> {
  override get message() {
    return `Document render failed (${this.reason})`;
  }
}
