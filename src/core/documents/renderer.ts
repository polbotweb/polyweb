/**
 * Port `PdfRenderer` (Effect) : HTML autonome → octets PDF. Le domaine (ventes, achats…)
 * produit le HTML, l'adaptateur (`@/lib/pdf/puppeteer`) le rend. Aucun moteur par défaut :
 * `PdfRendererUnavailable` échoue proprement (`reason: "unavailable"`).
 */
import { Context, Effect, Layer } from "effect";
import { DocumentRenderError } from "./errors";

export interface PdfRenderOptions {
  /** Format papier (défaut A4). */
  readonly format?: "A4" | "Letter";
  /** Délai maximal du rendu en millisecondes (défaut : celui de l'adaptateur). */
  readonly timeoutMs?: number;
}

export interface PdfRendererShape {
  readonly render: (html: string, options?: PdfRenderOptions) => Effect.Effect<Uint8Array, DocumentRenderError>;
}

export class PdfRenderer extends Context.Service<PdfRenderer, PdfRendererShape>()("polyweb/PdfRenderer") {}

/** Aucun moteur PDF configuré. */
export const PdfRendererUnavailable = Layer.succeed(PdfRenderer, {
  render: () => Effect.fail(new DocumentRenderError({ reason: "unavailable" })),
});

/** Moteur de test : enregistre le HTML et renvoie un PDF factice. */
export function makeMemoryPdfRenderer(): PdfRendererShape & { readonly rendered: string[] } {
  const rendered: string[] = [];
  return { rendered, render: (html) => Effect.sync(() => { rendered.push(html); return new TextEncoder().encode("%PDF-1.4\n%memory\n"); }) };
}
