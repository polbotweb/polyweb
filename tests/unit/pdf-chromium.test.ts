import { Effect, Exit, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { PdfRenderer } from '@/core/documents';
import {
  ChromiumLauncher, chromiumMode, makeLocalChromiumLauncher, makeServerlessChromiumLauncher, serverlessLaunchOptions,
} from '@/lib/pdf/chromium';
import { PuppeteerPdfRenderer } from '@/lib/pdf/puppeteer';

const failure = <A, E>(exit: Exit.Exit<A, E>) => (Exit.isFailure(exit) ? JSON.stringify(exit.cause) : '');

describe('chromiumMode', () => {
  it('local par défaut (dev, CI, Docker)', () => {
    expect(chromiumMode({})).toBe('local');
    expect(chromiumMode({ CI: 'true' })).toBe('local');
  });

  it('serverless sur Vercel ou AWS Lambda', () => {
    expect(chromiumMode({ VERCEL: '1' })).toBe('serverless');
    expect(chromiumMode({ AWS_LAMBDA_FUNCTION_NAME: 'fn' })).toBe('serverless');
  });

  it('PDF_CHROMIUM_MODE force le choix, valeur inconnue ignorée', () => {
    expect(chromiumMode({ VERCEL: '1', PDF_CHROMIUM_MODE: 'local' })).toBe('local');
    expect(chromiumMode({ PDF_CHROMIUM_MODE: ' Serverless ' })).toBe('serverless');
    expect(chromiumMode({ PDF_CHROMIUM_MODE: 'docker' })).toBe('local');
  });
});

describe('ChromiumLauncher local', () => {
  it('garde puppeteer-core en pipe avec le binaire de l’environnement', async () => {
    const options = await Effect.runPromise(makeLocalChromiumLauncher('/bin/chrome', {}).resolve);
    expect(options).toMatchObject({ executablePath: '/bin/chrome', headless: true, pipe: true });
  });

  it('sans binaire : échec unavailable', async () => {
    const exit = await Effect.runPromiseExit(makeLocalChromiumLauncher(null, {}).resolve);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(failure(exit)).toContain('unavailable');
  });
});

describe('ChromiumLauncher serverless', () => {
  const fake = { args: ['--single-process'], executablePath: vi.fn(async () => '/tmp/chromium') };

  it('utilise @sparticuz/chromium en headless shell, pipe conservé', async () => {
    const options = await serverlessLaunchOptions(fake);
    expect(options).toEqual({
      executablePath: '/tmp/chromium', headless: 'shell', pipe: true, args: ['--single-process', '--font-render-hinting=none'],
    });
  });

  it('charge le module une seule fois', async () => {
    const load = vi.fn(async () => fake);
    const launcher = makeServerlessChromiumLauncher(load);
    await Effect.runPromise(launcher.resolve);
    await Effect.runPromise(launcher.resolve);
    expect(launcher.mode).toBe('serverless');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('échec de chargement : unavailable, puis nouvelle tentative possible', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('no bin')).mockResolvedValue(fake);
    const launcher = makeServerlessChromiumLauncher(load);
    const exit = await Effect.runPromiseExit(launcher.resolve);
    expect(failure(exit)).toContain('unavailable');
    await expect(Effect.runPromise(launcher.resolve)).resolves.toMatchObject({ headless: 'shell' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('PuppeteerPdfRenderer', () => {
  it('rend via le ChromiumLauncher fourni par la couche', async () => {
    const launcher = Layer.succeed(ChromiumLauncher, makeLocalChromiumLauncher(null, {}));
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const renderer = yield* PdfRenderer;
        return yield* renderer.render('<p>x</p>');
      }).pipe(Effect.provide(PuppeteerPdfRenderer.pipe(Layer.provide(launcher)))),
    );
    expect(failure(exit)).toContain('unavailable');
  });
});
