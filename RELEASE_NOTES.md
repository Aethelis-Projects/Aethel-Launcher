# 🚀 Aethel Launcher v1.0.0-rc.5

Aethel Launcher **v1.0.0-rc.5** introduces an overhauled, robust release architecture with truly offline standalone installers, pixel-perfect installer layouts, and an atomic auto-updater distribution pipeline.

---

### 📦 Загрузка инсталлеров / Downloads

Для установки выберите автономный установщик для вашей операционной системы. Каждый инсталлер содержит встроенный дистрибутив и устанавливает лаунчер на 100% автономно без скачивания из сети.

| Платформа | Файл установщика | Описание |
|---|---|---|
| **Windows (x64)** | `Aethel-Installer-Windows-x64.exe` | Автономный установщик для Windows 10/11 x64 (прямая zip-распаковка ядра) |
| **Linux (x64)** | `Aethel-Installer-Linux-x64` | Автономный установщик для Linux (AppImage + интеграция XDG `.desktop`) |
| **macOS (Universal / Apple Silicon)** | `Aethel-Installer-macOS-universal` | Автономный установщик для macOS (прямое развёртывание в `/Applications`) |

---

### 🌟 Ключевые изменения и улучшения / What's Changed

- **Автономная распаковка без сбоев (Windows)**:
  Заменена нестабильная тихая установка NSIS на прямое извлечение payload через `zip::ZipArchive` с встроенной защитой от Zip-Slip (`is_safe_relative_path`). Добавлена строгая проверка целостности установленного бинарника (`> 1 MB`).
- **Идеальный лейаут инсталлера (720×520)**:
  Жёстко зафиксирована высота 100% (`html, body, #root`), шапка `TitleBar` 36px всегда на виду, кнопки футера прижаты к `y=520`, устранены наезды на верхний край и мёртвые зоны на финальном экране завершения.
- **Двухуровневая система релизов**:
  - Публичный релиз содержит **только** 3 автономных инсталлера.
  - Сервисный релиз `launcher-updates` изолированно раздаёт подписанные бандлы и `latest.json` для фонового автоапдейтера.
- **Стабильность CI/CD**:
  Внедрён 4-стадийный последовательный конвейер (`gate` $\to$ `build-launcher` $\to$ `build-installer` $\to$ `publish`) с единым атомарным публикатором, исключающий состояние гонки.

---

**Полный список коммитов**: https://github.com/Aethelis-Projects/Aethel-Launcher/commits/v1.0.0-rc.5
