import { describe, expect, it } from 'vitest';
import { chromiumExecutablePath, pdfLaunchOptions } from '@/lib/pdf/puppeteer';

describe('pdfLaunchOptions', () => {
  it('se connecte par pipe pour que Chromium meure avec le processus Node', () => {
    expect(pdfLaunchOptions('/bin/chrome', {})).toMatchObject({ executablePath: '/bin/chrome', headless: true, pipe: true });
  });

  it('désactive le sandbox par défaut, le réactive avec PDF_CHROMIUM_SANDBOX=1', () => {
    expect(pdfLaunchOptions('/bin/chrome', {}).args).toContain('--no-sandbox');
    expect(pdfLaunchOptions('/bin/chrome', { PDF_CHROMIUM_SANDBOX: '1' }).args).not.toContain('--no-sandbox');
  });

  it('résout le chemin Chromium depuis l’environnement', () => {
    expect(chromiumExecutablePath({ PDF_CHROMIUM_PATH: '/a', PUPPETEER_EXECUTABLE_PATH: '/b' })).toBe('/a');
    expect(chromiumExecutablePath({ PUPPETEER_EXECUTABLE_PATH: '/b' })).toBe('/b');
    expect(chromiumExecutablePath({})).toBeNull();
  });
});
