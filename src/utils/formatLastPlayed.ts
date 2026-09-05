import type { TFunction } from 'i18next';

export function formatLastPlayed(
  isoString: string | null | undefined,
  t: TFunction<any, any> | ((key: any, ...args: any[]) => any)
): string {
  if (!isoString) {
    return t('instances.never', 'Никогда');
  }

  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return t('instances.never', 'Никогда');
  }

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const pad = (n: number) => n.toString().padStart(2, '0');
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (isToday) {
    return `${t('common.today', 'Сегодня')}, ${timeStr}`;
  }

  if (isYesterday) {
    return `${t('common.yesterday', 'Вчера')}, ${timeStr}`;
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) {
    const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
    return `${weekday}, ${timeStr}`;
  }

  const formattedDate = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return `${formattedDate}, ${timeStr}`;
}

export function formatPlaytime(
  seconds: number,
  t: TFunction<any, any> | ((key: any, ...args: any[]) => any)
): string {
  if (!seconds || seconds <= 0) {
    return '—';
  }

  if (seconds < 60) {
    return `< 1 ${t('instances.minutes', 'мин')}`;
  }

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${mins} ${t('instances.minutes', 'мин')}`;
  }

  return `${hours} ${t('instances.hours', 'ч')} ${mins} ${t('instances.minutes', 'мин')}`;
}
