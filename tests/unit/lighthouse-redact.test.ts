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

  it('keeps empty or absent headers untouched', () => {
    const text = '{"extraHeaders":null,"x":{"Cookie":""}}';
    expect(redactText(text)).toBe(text);
  });
});
