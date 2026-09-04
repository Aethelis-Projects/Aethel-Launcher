import type { TFunction } from 'i18next';
import type { AppErrorCode } from '../bindings';

export interface LocalizedError {
  title: string;
  message: string;
}

export function localizeError(code: AppErrorCode | string, t: TFunction): LocalizedError {
  const codeKey = code as AppErrorCode;
  const titleKey = `errors.${codeKey}.title`;
  const messageKey = `errors.${codeKey}.message`;

  const title = t(titleKey);
  const message = t(messageKey);

  // If translation keys are missing, provide fallback
  if (title === titleKey) {
    return {
      title: t('errors.INTERNAL_ERROR.title'),
      message: `${t('errors.INTERNAL_ERROR.message')} [${code}]`,
    };
  }

  return { title, message };
}
