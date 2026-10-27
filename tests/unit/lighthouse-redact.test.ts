import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { redactText, findLeaks, REDACTED } = require('../helpers/lighthouse-redact.cjs') as {
  redactText: (t: string) => string;
  findLeaks: (t: string) => string[];
  REDACTED: string;
};

describe('lighthouse report redaction', () => {
  const raw = JSON.stringify({ configSettings: { extraHeaders: { Cookie: 'better-auth.session_token=abc.DEF%3D' } }, note: 'better-auth.session_data=xyz;' });

  it('redacts cookie headers and better-auth cookies', () => {
    const out = redactText(raw);
    expect(out).not.toContain('abc.DEF');
    expect(out).not.toContain('xyz');
    expect(out).toContain(`"Cookie":"${REDACTED}"`);
    expect(findLeaks(out)).toEqual([]);
  });

  it('flags leaks and is idempotent', () => {
    expect(findLeaks(raw).length).toBeGreaterThan(0);
    const once = redactText(raw);
    expect(redactText(once)).toBe(once);
  });

  it('redacts the shop cart cookie and order access tokens (plain and encoded)', () => {
    const shop = JSON.stringify({ h: { Cookie: 'pw_cart=cart_123.MAC-abc' }, u: 'http://x/fr/shop/order/ord_1?t=Tok_en-123', e: 'http%3A%2F%2Fx%2Fshop%2Forder%2Ford_1%3Ft%3DTok_en-456' });
    const out = redactText(shop);
    expect(out).not.toMatch(/MAC-abc|Tok_en/);
    expect(out).toContain('/shop/order/ord_1?t=REDACTED');
    expect(findLeaks(shop).length).toBeGreaterThan(0);
    expect(findLeaks(out)).toEqual([]);
    expect(redactText(out)).toBe(out);
  });

  it('keeps empty or absent headers untouched', () => {
    const text = '{"extraHeaders":null,"x":{"Cookie":""}}';
    expect(redactText(text)).toBe(text);
  });
});
