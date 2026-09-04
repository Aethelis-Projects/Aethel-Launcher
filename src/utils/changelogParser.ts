export interface ChangelogSection {
  title: string;
  items: string[];
  icon: string;
}

export interface ParsedChangelog {
  sections: ChangelogSection[];
  compareUrl: string | null;
  isEmpty: boolean;
}

const FALLBACK_FEATURES: Record<string, ChangelogSection[]> = {
  'v1.0.0-rc.2': [
    {
      title: 'Новые возможности',
      icon: '\u2728',
      items: [
        'Кастомный анимированный инсталлер (6-шаговый мастер с Minisign-верификацией)',
        'Импорт модпаков CurseForge (.zip с manifest.json и пакетной загрузкой модов)',
        'Реальный запуск игрового процесса Minecraft с логированием stdout/stderr',
        'Безрамочный интерфейс с кастомными кнопками управления окном Windows',
      ],
    },
    {
      title: 'Исправления и оптимизация',
      icon: '\uD83D\uDC1B',
      items: [
        'Устранена ошибка соединения ERR_CONNECTION_REFUSED в автономном инсталлере',
        'Устранена проблема сборщика WiX MSI для версий с pre-release суффиксами',
        'Оптимизирована верстка окна обновления и оформление списка изменений',
      ],
    },
  ],
};

export function parseChangelog(raw?: string | null, version?: string): ParsedChangelog {
  if (!raw || !raw.trim()) {
    return getFallbackChangelog(version);
  }

  const compareMatch = raw.match(/\*\*Full Changelog\*\*:\s*(https:\/\/[^\s]+)/);
  const compareUrl = compareMatch ? compareMatch[1] : null;

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const cleanLines = lines.filter((l) => !l.includes('**Full Changelog**'));

  const sections: ChangelogSection[] = [];
  let currentSection: ChangelogSection | null = null;

  for (const line of cleanLines) {
    if (line.startsWith('## ') || line.startsWith('### ')) {
      if (currentSection && currentSection.items.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        title: line.replace(/^#+\s*/, ''),
        items: [],
        icon: inferIcon(line),
      };
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!currentSection) {
        currentSection = {
          title: 'Изменения',
          items: [],
          icon: '\uD83D\uDCCB',
        };
      }
      currentSection.items.push(line.replace(/^[*-]\s*/, ''));
    } else if (line.length > 0) {
      if (!currentSection) {
        currentSection = {
          title: 'Описание релиза',
          items: [],
          icon: inferIcon(line),
        };
      }
      currentSection.items.push(line);
    }
  }

  if (currentSection && currentSection.items.length > 0) {
    sections.push(currentSection);
  }

  const isEmpty =
    sections.length === 0 || sections.every((s) => s.items.length === 0);

  if (isEmpty) {
    const fallback = getFallbackChangelog(version);
    return {
      sections: fallback.sections,
      compareUrl: compareUrl || fallback.compareUrl,
      isEmpty: false,
    };
  }

  return { sections, compareUrl, isEmpty: false };
}

function getFallbackChangelog(version?: string): ParsedChangelog {
  const normVer = version ? (version.startsWith('v') ? version : `v${version}`) : 'v1.0.0-rc.2';
  const found = FALLBACK_FEATURES[normVer] || FALLBACK_FEATURES['v1.0.0-rc.2'];
  return {
    sections: found,
    compareUrl: `https://github.com/Aethelis-Projects/Aethel-Launcher/releases/tag/${normVer}`,
    isEmpty: false,
  };
}

function inferIcon(header: string): string {
  // If the header already contains an emoji, preserve it
  const emojiMatch = header.match(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u);
  if (emojiMatch) {
    return emojiMatch[1];
  }

  const lower = header.toLowerCase();
  if (lower.includes("what's changed") || lower.includes('new') || lower.includes('feature') || lower.includes('новое') || lower.includes('возможност')) return '\u2728';
  if (lower.includes('fix') || lower.includes('bug') || lower.includes('исправлен')) return '\uD83D\uDC1B';
  if (lower.includes('break') || lower.includes('breaking')) return '\uD83D\uDCA5';
  if (lower.includes('perf') || lower.includes('optimiz') || lower.includes('производительн')) return '\u26A1';
  if (lower.includes('contrib')) return '\uD83D\uDC65';
  return '\uD83D\uDCCB';
}