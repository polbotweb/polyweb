/**
 * Adaptateur Puppeteer du port `PdfRenderer` (`@/core/documents`).
 *
 * - Chromium choisi par la couche `ChromiumLauncher` (`./chromium`) : binaire de l'environnement
 *   en local / CI (`PDF_CHROMIUM_PATH`, ou `PUPPETEER_EXECUTABLE_PATH`), `@sparticuz/chromium`
 *   en serverless. `puppeteer-core` ne télécharge rien. Absent → `DocumentRenderError{reason:"unavailable"}`.
 * - Navigateur lancé à la première demande puis réutilisé (relancé s'il se déconnecte).
 * - Connexion par pipe (`pipe: true`) et non WebSocket : Chromium (lancé détaché par Puppeteer)
 *   se termine dès que le processus Node meurt, même tué par SIGKILL (ex. arrêt du `webServer`
 *   Playwright), au lieu de rester orphelin.
 * - Une page par rendu : JavaScript désactivé, toute requête réseau bloquée (seuls `data:` et
 *   `about:` passent), délai borné (`PDF_RENDER_TIMEOUT_MS`, défaut 15 s).
 * - `--no-sandbox` par défaut (CI / conteneurs sans espaces de noms) ; `PDF_CHROMIUM_SANDBOX=1`
 *   le réactive. Le HTML rendu est produit par nos gabarits (valeurs échappées), jamais fourni tel quel.
 */
import { Duration, Effect, Layer } from "effect";
import type { Browser } from "puppeteer-core";
import { DocumentRenderError, PdfRenderer, type PdfRendererShape, type PdfRenderOptions } from "@/core/documents";
import {
  ChromiumLauncher, ChromiumLauncherLive, chromiumExecutablePath, makeLocalChromiumLauncher,
  type ChromiumLaunch, type ChromiumLauncherShape,
} from "./chromium";

export { chromiumExecutablePath, pdfLaunchOptions } from "./chromium";

const DEFAULT_TIMEOUT_MS = 15_000;

const timeoutFromEnv = () => {
  const value = Number(process.env.PDF_RENDER_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
};

const isTimeout = (cause: unknown) => cause instanceof Error && cause.name === "TimeoutError";

let browserPromise: Promise<Browser> | null = null;
let browserKey: string | null = null;

const launch = async (options: ChromiumLaunch): Promise<Browser> => {
  const { launch: launchBrowser } = await import("puppeteer-core");
  const browser = await launchBrowser({ ...options, args: [...options.args] });
  browser.on("disconnected", () => { browserPromise = null; browserKey = null; });
  return browser;
};

/** Navigateur partagé ; relancé si les options de lancement changent. */
const sharedBrowser = async (options: ChromiumLaunch) => {
  const key = JSON.stringify(options);
  if (browserPromise && browserKey !== key) await closePdfBrowser();
  if (!browserPromise) {
    browserKey = key;
    browserPromise = launch(options).catch((error: unknown) => { browserPromise = null; browserKey = null; throw error; });
  }
  return browserPromise;
};

/** Ferme le navigateur partagé (fin de tests, arrêt du serveur). */
export const closePdfBrowser = async () => {
  const pending = browserPromise;
  browserPromise = null;
  browserKey = null;
  if (pending) await (await pending.catch(() => null))?.close().catch(() => undefined);
};

const renderWith = async (launchOptions: ChromiumLaunch, html: string, options: PdfRenderOptions, timeoutMs: number) => {
  const browser = await sharedBrowser(launchOptions);
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

/**
 * Adaptateur à partir d'un `ChromiumLauncher` (ou, pour les tests, d'un chemin de binaire local).
 */
export const makePuppeteerPdfRenderer = (
  launcher: ChromiumLauncherShape | string | null = chromiumExecutablePath(),
): PdfRendererShape => {
  const source = typeof launcher === "object" && launcher !== null ? launcher : makeLocalChromiumLauncher(launcher);
  return {
    render: (html, options = {}) => {
      const timeoutMs = options.timeoutMs ?? timeoutFromEnv();
      return source.resolve.pipe(
        Effect.flatMap((launchOptions) => Effect.tryPromise({
          try: () => renderWith(launchOptions, html, options, timeoutMs),
          catch: (cause) => new DocumentRenderError({ reason: isTimeout(cause) ? "timeout" : "render", cause }),
        })),
        Effect.timeoutOrElse({ duration: Duration.millis(timeoutMs + 1_000), orElse: () => Effect.fail(new DocumentRenderError({ reason: "timeout" })) }),
      );
    },
  };
};

/** Adaptateur branché sur le `ChromiumLauncher` du contexte. */
export const PuppeteerPdfRenderer = Layer.effect(PdfRenderer, Effect.gen(function* () {
  const launcher = yield* ChromiumLauncher;
  return makePuppeteerPdfRenderer(launcher);
}));

/** Couche de production : Chromium local ou serverless selon l'environnement (`ChromiumLauncherLive`). */
export const PuppeteerPdfRendererLive = PuppeteerPdfRenderer.pipe(Layer.provide(ChromiumLauncherLive));
