# MEMORY.md — долгосрочная память проекта Aethel Launcher

## 1. Проект

Aethel Launcher — десктопный Minecraft-лаунчер (Tauri 2 + React 19 + TypeScript + Tailwind CSS 4 + Zustand + framer-motion). Версия на момент записи: v1.0.0-rc.11. Окно 1200×780 (min 960×640). Дизайн-система: [docs/DESIGN_HANDOFF.md](docs/DESIGN_HANDOFF.md) — единственный источник правды по стилю.

## 2. Архитектура

Фронт `src/` (React), бэк `src-tauri/` + `crates/` (Rust). IPC — типизированный `src/bindings.ts` (tauri-specta, генерируемый — не редактировать руками). Сторы — Zustand (`src/store/`). Токены дизайна — только `src/index.css`.

## 3. Статус крупных работ

- Визуальный редизайн: **DONE** (2026-09-06). Коммиты `11a87a4…1f0096d`. Все 22 компонента переведены на семантические токены; regex-скан подтверждает ноль сырых цветов; `tsc`/`oxlint`/vitest 59/59/`vite build` — зелёные. Срезов A–D больше нет — актуальное состояние целиком описано в `docs/DESIGN_HANDOFF.md` (токены, канонические паттерны, адаптивный слой, чек-лист нового компонента).

## 4. Правила стиля (кратко)

Только токены `var(--…)` — сырые цвета и hex в компонентах запрещены. Радиусы 8/12/16, других нет. Motion-бюджет: вход модалок (opacity/scale 0.96/y8, 160ms) + stagger списков ≤0.18s; exit-анимации без AnimatePresence нельзя. Все строки через `t()`; `data-testid` неприкосновенны.

## 5. Верификация перед коммитом

`npx tsc -b && npm run lint && npm test && npm run build` — все четыре зелёные.

## 6. Известные ограничения

- Браузерный просмотр (без Tauri) рендерит только оболочку с пустыми данными; холодный первый loading — 30–60с (Tailwind v4 transform). Native-проверка — `npm run tauri dev`.

## 7. Технический долг

- Bundle ~820KB (vite chunk warning): кандидаты — lazy-load `react-markdown` (только detail-вью), dynamic import тяжёлых модалок (ModpackBrowser/InstanceManager), `manualChunks` для framer-motion. Решить после v1.0.0 stable.
