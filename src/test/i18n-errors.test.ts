import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
import { localizeError } from '../utils/errors';
import type { AppErrorCode } from '../bindings';

const errorCodes: AppErrorCode[] = [
  'NO_DISK_SPACE',
  'NETWORK_ERROR',
  'HASH_MISMATCH',
  'JAVA_NOT_FOUND',
  'JAVA_INCOMPATIBLE',
  'CLASSPATH_TOO_LONG',
  'INVALID_MANIFEST',
  'ZIP_SLIP_DETECTED',
  'AUTH_FAILED',
  'KEYRING_ACCESS_FAILED',
  'ENCRYPTION_FAILED',
  'DECRYPTION_FAILED',
  'INSTANCE_NOT_FOUND',
  'INTERNAL_ERROR',
];

describe('i18n & Error Localization Suite', () => {
  it('localizes all AppErrorCodes in Russian', async () => {
    await i18n.changeLanguage('ru');

    for (const code of errorCodes) {
      const { title, message } = localizeError(code, i18n.t);
      expect(title).toBeDefined();
      expect(title).not.toBe(`errors.${code}.title`);
      expect(message).toBeDefined();
      expect(message).not.toBe(`errors.${code}.message`);
    }
  });

  it('localizes all AppErrorCodes in English', async () => {
    await i18n.changeLanguage('en');

    for (const code of errorCodes) {
      const { title, message } = localizeError(code, i18n.t);
      expect(title).toBeDefined();
      expect(title).not.toBe(`errors.${code}.title`);
      expect(message).toBeDefined();
      expect(message).not.toBe(`errors.${code}.message`);
    }
  });

  it('provides safe fallback for unmapped error code', async () => {
    const { title, message } = localizeError('UNKNOWN_CODE' as any, i18n.t);
    expect(title).toBeDefined();
    expect(message).toContain('UNKNOWN_CODE');
  });
});
