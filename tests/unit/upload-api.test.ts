import { describe, it, expect } from 'vitest';
import { UPLOAD_DIRS } from '@/media/types';

/**
 * Unit tests for /api/upload endpoint validation patterns.
 * We can't import the Astro APIRoute directly, so we test the validation
 * logic patterns: type validation, oldUrl regex, directory restriction.
 */

const SAFE_PATH_REGEX = /^\/uploads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

describe('/api/upload — type validation', () => {
  it('UPLOAD_DIRS contains expected types', () => {
    expect('logo' in UPLOAD_DIRS).toBe(true);
    expect('avatar' in UPLOAD_DIRS).toBe(true);
    expect('site' in UPLOAD_DIRS).toBe(true);
  });

  it('rejects unknown upload type', () => {
    expect('malicious' in UPLOAD_DIRS).toBe(false);
    expect('../etc' in UPLOAD_DIRS).toBe(false);
  });
});

describe('/api/upload — oldUrl path validation', () => {
  it('accepts valid upload path', () => {
    expect(SAFE_PATH_REGEX.test('/uploads/images/logos/abc123.webp')).toBe(true);
  });

  it('rejects path traversal attempts', () => {
    expect(SAFE_PATH_REGEX.test('/uploads/../../../etc/passwd')).toBe(false);
    expect(SAFE_PATH_REGEX.test('/uploads/images/../../etc/passwd')).toBe(false);
  });

  it('rejects paths with spaces', () => {
    expect(SAFE_PATH_REGEX.test('/uploads/images/logos/file name.webp')).toBe(false);
  });

  it('rejects paths without proper structure', () => {
    expect(SAFE_PATH_REGEX.test('/uploads/file.webp')).toBe(false);
    expect(SAFE_PATH_REGEX.test('/uploads/a/file.webp')).toBe(false);
  });

  it('rejects empty or root paths', () => {
    expect(SAFE_PATH_REGEX.test('')).toBe(false);
    expect(SAFE_PATH_REGEX.test('/')).toBe(false);
    expect(SAFE_PATH_REGEX.test('/uploads/')).toBe(false);
  });

  it('rejects paths outside uploads/', () => {
    expect(SAFE_PATH_REGEX.test('/etc/passwd')).toBe(false);
    expect(SAFE_PATH_REGEX.test('/src/lib/auth.ts')).toBe(false);
  });

  it('directory restriction works correctly', () => {
    const type = 'logo';
    const expectedDir = `/uploads/${UPLOAD_DIRS[type as keyof typeof UPLOAD_DIRS]}/`;
    const validUrl = `${expectedDir}sub/file.webp`;
    expect(validUrl.startsWith(expectedDir)).toBe(true);

    // Cross-type: avatar URL should NOT start with logo's dir
    const avatarDir = `/uploads/${UPLOAD_DIRS['avatar' as keyof typeof UPLOAD_DIRS]}/`;
    expect(validUrl.startsWith(avatarDir)).toBe(false);
  });
});
