/**
 * Sélection du Chromium utilisé par l'adaptateur PDF (couche Effect `ChromiumLauncher`).
 *
 * - **Local / CI / Docker** (`LocalChromiumLive`) : binaire fourni par l'environnement
 *   (`PDF_CHROMIUM_PATH` ou `PUPPETEER_EXECUTABLE_PATH`), lancé par `puppeteer-core` en pipe.
 * - **Serverless** (`ServerlessChromiumLive`, Vercel / AWS Lambda) : `@sparticuz/chromium`,
 *   importé dynamiquement uniquement dans ce cas (aucun coût ailleurs), en mode `headless: "shell"`.
 * - `ChromiumLauncherLive` choisit selon l'environnement (`chromiumMode`) ; `PDF_CHROMIUM_MODE`
 *   (`local` | `serverless`) force le choix.
 */
import { Context, Effect, Layer } from "effect";
import { DocumentRenderError } from "@/core/documents";

type Env = Record<string, string | undefined>;

/** Options passées à `puppeteer.launch`. */
export interface ChromiumLaunch {
  readonly executablePath: string;
  readonly headless: true | "shell";
  readonly pipe: true;
  readonly args: readonly string[];
}

export interface ChromiumLauncherShape {
  /** Mode retenu, pour les journaux et les tests. */
  readonly mode: ChromiumMode;
  /** Options de lancement ; `DocumentRenderError{reason:"unavailable"}` si aucun Chromium. */
  readonly resolve: Effect.Effect<ChromiumLaunch, DocumentRenderError>;
}

export class ChromiumLauncher extends Context.Service<ChromiumLauncher, ChromiumLauncherShape>()("polyweb/ChromiumLauncher") {}

export type ChromiumMode = "local" | "serverless";

/** Serverless si forcé, ou si l'environnement est Vercel / AWS Lambda. */
export const chromiumMode = (env: Env = process.env): ChromiumMode => {
  const forced = env.PDF_CHROMIUM_MODE?.trim().toLowerCase();
  if (forced === "local" || forced === "serverless") return forced;
  return env.VERCEL === "1" || Boolean(env.AWS_LAMBDA_FUNCTION_NAME) ? "serverless" : "local";
};

export const chromiumExecutablePath = (env: Env = process.env) =>
  env.PDF_CHROMIUM_PATH || env.PUPPETEER_EXECUTABLE_PATH || null;

/** Options de lancement locales (pipe : Chromium meurt avec le processus Node). */
export const pdfLaunchOptions = (executablePath: string, env: Env = process.env): ChromiumLaunch => {
  const args = ["--disable-gpu", "--disable-dev-shm-usage", "--font-render-hinting=none"];
  if (env.PDF_CHROMIUM_SANDBOX !== "1") args.push("--no-sandbox", "--disable-setuid-sandbox");
  return { executablePath, headless: true, pipe: true, args };
};

/** Options serverless à partir du module `@sparticuz/chromium` (injectable pour les tests). */
export interface SparticuzModule {
  readonly args: readonly string[];
  readonly executablePath: () => Promise<string>;
}

export const serverlessLaunchOptions = async (chromium: SparticuzModule): Promise<ChromiumLaunch> => ({
  executablePath: await chromium.executablePath(),
  headless: "shell",
  pipe: true,
  args: [...chromium.args, "--font-render-hinting=none"],
});

export const makeLocalChromiumLauncher = (executablePath: string | null, env: Env = process.env): ChromiumLauncherShape => ({
  mode: "local",
  resolve: executablePath
    ? Effect.succeed(pdfLaunchOptions(executablePath, env))
    : Effect.fail(new DocumentRenderError({ reason: "unavailable" })),
});

const importSparticuz = async (): Promise<SparticuzModule> => (await import("@sparticuz/chromium")).default;

export const makeServerlessChromiumLauncher = (load: () => Promise<SparticuzModule> = importSparticuz): ChromiumLauncherShape => {
  let cached: Promise<ChromiumLaunch> | null = null;
  return {
    mode: "serverless",
    resolve: Effect.tryPromise({
      try: () => {
        cached ??= load().then(serverlessLaunchOptions).catch((error: unknown) => { cached = null; throw error; });
        return cached;
      },
      catch: (cause) => new DocumentRenderError({ reason: "unavailable", cause }),
    }),
  };
};

export const LocalChromiumLive = Layer.sync(ChromiumLauncher, () => makeLocalChromiumLauncher(chromiumExecutablePath()));
export const ServerlessChromiumLive = Layer.sync(ChromiumLauncher, () => makeServerlessChromiumLauncher());

/** Couche par défaut : choix selon l'environnement au moment de la construction. */
export const ChromiumLauncherLive = Layer.suspend(() =>
  chromiumMode() === "serverless" ? ServerlessChromiumLive : LocalChromiumLive);
