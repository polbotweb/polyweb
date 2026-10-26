/**
 * Adaptateur Puppeteer du port `PdfRenderer` (`@/core/documents`).
 *
 * - Chromium fourni par l'environnement (`PDF_CHROMIUM_PATH`, ou `PUPPETEER_EXECUTABLE_PATH`) :
 *   `puppeteer-core` ne télécharge rien. Absent → `DocumentRenderError{reason:"unavailable"}`.
 * - Navigateur lancé à la première demande puis réutilisé (relancé s'il se déconnecte).
 * - Une page par rendu : JavaScript désactivé, toute requête réseau bloquée (seuls `data:` et
 *   `about:` passent), délai borné (`PDF_RENDER_TIMEOUT_MS`, défaut 15 s).
 * - `--no-sandbox` par défaut (CI / conteneurs sans espaces de noms) ; `PDF_CHROMIUM_SANDBOX=1`
 *   le réactive. Le HTML rendu est produit par nos gabarits (valeurs échappées), jamais fourni tel quel.
 */
import { Duration, Effect, Layer } from "effect";
import type { Browser } from "puppeteer-core";
import { DocumentRenderError, PdfRenderer, type PdfRendererShape, type PdfRenderOptions } from "@/core/documents";

const DEFAULT_TIMEOUT_MS = 15_000;

export const chromiumExecutablePath = (env: Record<string, string | undefined> = process.env) =>
  env.PDF_CHROMIUM_PATH || env.PUPPETEER_EXECUTABLE_PATH || null;

const timeoutFromEnv = () => {
  const value = Number(process.env.PDF_RENDER_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
};

const isTimeout = (cause: unknown) => cause instanceof Error && cause.name === "TimeoutError";

let browserPromise: Promise<Browser> | null = null;

const launch = async (executablePath: string): Promise<Browser> => {
  const { launch: launchBrowser } = await import("puppeteer-core");
  const args = ["--disable-gpu", "--disable-dev-shm-usage", "--font-render-hinting=none"];
  if (process.env.PDF_CHROMIUM_SANDBOX !== "1") args.push("--no-sandbox", "--disable-setuid-sandbox");
  const browser = await launchBrowser({ executablePath, headless: true, args });
  browser.on("disconnected", () => { browserPromise = null; });
  return browser;
};

const sharedBrowser = (executablePath: string) => {
  browserPromise ??= launch(executablePath).catch((error: unknown) => { browserPromise = null; throw error; });
  return browserPromise;
};

/** Ferme le navigateur partagé (fin de tests, arrêt du serveur). */
export const closePdfBrowser = async () => {
  const pending = browserPromise;
  browserPromise = null;
  if (pending) await (await pending.catch(() => null))?.close().catch(() => undefined);
};

const renderWith = async (executablePath: string, html: string, options: PdfRenderOptions, timeoutMs: number) => {
  const browser = await sharedBrowser(executablePath);
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("data:") || url.startsWith("about:")) void request.continue();
      else void request.abort("blockedbyclient");
    });
    await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
    return await page.pdf({ format: options.format ?? "A4", printBackground: true, preferCSSPageSize: true, timeout: timeoutMs });
  } finally {
    await page.close().catch(() => undefined);
  }
};

export const makePuppeteerPdfRenderer = (executablePath = chromiumExecutablePath()): PdfRendererShape => ({
  render: (html, options = {}) => {
    if (!executablePath) return Effect.fail(new DocumentRenderError({ reason: "unavailable" }));
    const timeoutMs = options.timeoutMs ?? timeoutFromEnv();
    return Effect.tryPromise({
      try: () => renderWith(executablePath, html, options, timeoutMs),
      catch: (cause) => new DocumentRenderError({ reason: isTimeout(cause) ? "timeout" : "render", cause }),
    }).pipe(
      Effect.timeoutOrElse({ duration: Duration.millis(timeoutMs + 1_000), orElse: () => Effect.fail(new DocumentRenderError({ reason: "timeout" })) }),
    );
  },
});

/** Couche de production : Puppeteer si Chromium est configuré, sinon échec `unavailable` à l'appel. */
export const PuppeteerPdfRendererLive = Layer.sync(PdfRenderer, () => makePuppeteerPdfRenderer());
