# Aethel Launcher — Design System Handoff

> Для агента, продолжающего разработку (Gemini). Визуальная система построена
> срезами 2026-09/10. Функционал при редизайне НЕ менялся. Новые фичи оформляй
> ТОЛЬКО по этому документу.

## 1. Summary
- Полный визуальный редизайн: графитовые поверхности, акцент cyan→indigo,
  единые радиусы/бордеры, Motion только для карточек/CTA/входа модалок.
- Коммиты среза 1: `3e533ba`, `3a026f4` (index.css, App.tsx, TitleBar.tsx, InstanceGrid.tsx).
- Task 2: `CreateInstanceModal.tsx` (c4b3a69), `SettingsModal.tsx` (доделан архитектором).
- НЕ тронуто: `commands.*`, Zustand-сторы, хуки, i18n-ключи, tauri.conf.json,
  drag/no-drag механика TitleBar.
- Зависимости: добавлен только `framer-motion` (MIT, 0 copyleft).

## 2. Design Tokens (единственный источник правды — `src/index.css`)
| Токен | Назначение |
|---|---|
| `--surface-0/1/2/3` | фон окна / панели / карточки / hover+инпуты |
| `--line-subtle`, `--line-strong` | тонкие бордеры / акцентные бордеры |
| `--text-primary/secondary/muted` | иерархия текста |
| `--text-on-accent` | контрастный белый текст для активных CTA и бейджей |
| `--accent-from`, `--accent-to` | градиент CTA (cyan→indigo) |
| `--accent` | солидный акцент для иконок/ссылок/выбранных элементов |
| `--accent-soft`, `--accent-line` | заливка/бордер hover-состояний |
| `--success`, `--success-soft` | успешные статусы / мягкий фон бейджей |
| `--warning`, `--warning-soft` | amber: queued/pending/предупреждения |
| `--danger`, `--danger-soft` | деструктивные действия / ошибки |
| `--shadow-sm/md/lg` | эшелоны высоты (строка → панель → модалка) |
| `--shadow-glow` | мягкое свечение кнопок действия |
| `--radius-sm/md/lg` | 8/12/16px — других радиусов нет |
| `--ring` | двойное focus-кольцо с зазором поверхности |
| `--ease-out-soft` | cubic-bezier(0.2, 0, 0, 1) для CSS-переходов |
| `--font-sans`, `--font-mono` | Segoe UI Variable / Cascadia Code (@theme) |

Светлая тема в будущем = подмена значений переменных. Поэтому в компонентах
ЗАПРЕЩЕНЫ сырые цвета (`bg-zinc-900`, `text-cyan-400` и т.п.).

## 3. Canonical Patterns (копировать как есть)
- Заголовок секции:
  `flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]`
  + иконка `text-[var(--accent-from)]`.
- Карточка-строка:
  `rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3`.
- Select/input:
  `rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none`.
- Кнопка secondary:
  `rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] ... hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]`.
- Кнопка primary (CTA): градиент `--accent-from → --accent-to`, glow на hover.
- Модалка: backdrop `bg-[var(--surface-0)]/80 backdrop-blur-md`,
  панель `bg-[var(--surface-2)] border-[var(--line-strong)] rounded-[var(--radius-lg)]`,
  вход через `motion.div` (opacity+scale 0.96+y8, 150–180ms, easeOut),
  `useReducedMotion()` → `initial={false}`.
- Toggle: peer-механика, off `bg-[var(--surface-3)]`, on `bg-[var(--accent-to)]`.

## 4. Per-file changelog (было → стало)
- `index.css`: сырая палитра → семантические токены + focus-ring + reduced-motion + ambient-glow + тонкие скроллбары + elevation-шкала + warning-статус + @theme шрифты.
- `App.tsx`: фон/лейаут на токенах; адаптивный сайдбар — иконка-рейл `w-[60px]` при < lg, полный `w-56` при ≥ lg.
- `TitleBar.tsx`: навигация на токенах; drag/no-drag и stopPropagation СОХРАНЕНЫ.
- `InstanceGrid.tsx`: карточки на токенах + Motion stagger; адаптив `minmax(300px,1fr)`; тулбар flex-wrap.
- `CreateInstanceModal.tsx`, `SettingsModal.tsx`: полный перевод на токены + motion-вход.
- `InstanceSettingsModal.tsx`, `JavaManagerModal.tsx`: полный перевод на токены + motion-вход.
- `ConfirmDialog.tsx`, `CrashReportModal.tsx`, `AccountModal.tsx`, `UpdateChecker.tsx`: токены + motion-вход; danger/warning/info варианты; стектрейс font-mono + select-text; changelog text-pretty.
- `DownloadsPanel.tsx`, `LogViewer.tsx`: слайд-овер и логи на токенах; статусы success/warning/danger/-soft бейджи; логи select-text + font-mono; tabular-nums.
- `ModManagerModal.tsx`, `ModBrowserModal.tsx`, `ModloaderSelector.tsx`, `VersionSelector.tsx`, `SafeHtml.tsx`: токены; дропдауны max-h + scroll; toggle off surface-3 / on accent-to; prose-стили на токенах.
- `ModpackBrowserModal.tsx`, `ModpackImportModal.tsx`, `ModpackInstallModal.tsx`, `ModpackExportModal.tsx`: карточки auto-fill, дропзона dashed + accent hover, прогресс h-1.5, tabular-nums.
- `InstanceManagerModal.tsx`: все 6 вкладок на токенах; вкладки с accent-подчёркиванием + overflow-x-auto; таблицы/списки по канону; motion-вход.

Редизайн завершён: во всех компонентах src/ ноль сырых цветов (проверено regex-сканом), `npx tsc -b && npm run lint && npm test && npm run build` — зелёные.

## 5. Rules (do / don't)
DO: токены; канонические паттерны; lucide-react; motion-бюджет (карточки/CTA/модалки);
hover/focus-visible состояния; reduced-motion.
DON'T: сырые цвета; новые зависимости; глобальный CSS вне index.css; новые глобальные
компоненты без согласования; трогать i18n/IPC/сторы/drag-region; exit-анимации без AnimatePresence-рефактора.

## 7. Адаптивность (окно 960×640 min, 1200×780 default)
- Точка адапива — Tailwind `lg` (1024px). Сайдбар: при < lg иконка-рейл `w-[60px]` (labels `hidden lg:inline` + `title`), при ≥ lg полный `w-56`.
- Модалки: `max-h-[85vh] flex flex-col overflow-hidden` + внутренний `overflow-y-auto min-h-0` для контента.
- Тулбары: `flex-wrap gap-2/3`; сетки: `repeat(auto-fill, minmax(260px,1fr))`; панель вкладок: `overflow-x-auto`.
- Текст: длинные имена `min-w-0 truncate + title`; числа — `tabular-nums`; версии/пути — `font-mono`.
- Логи — `select-text` (единственное место, где выделение разрешено); ambient-фон body: два фиксированных radial-glow поверх `--surface-0`.

## 8. Чек-лист нового компонента
1. Разметка из канонических паттернов §3. 2. Только токены. 3. Hover/focus/empty/error.
4. Все строки через `t()`. 5. `npx tsc -b && npm run lint && npm test && npm run build`.
6. Скриншот в нативном `npm run tauri dev` на приёмку.
