<USER_REQUEST>
Вот v6 — финальная, замороженная версия: v5 + вкатанные фиксы двух последних ревью + все секции, потерянные между итерациями (фронтенд-тесты, ручная верификация, tauri-driver, smoke-сьюты). Одно принципиальное отличие от v5: **векторы UUID фиксируются исполнением, а не текстом** — в документе их значений больше нет, есть механизм. Документ самодостаточен и заменяет все предыдущие версии.

---

# Aethel Launcher — Master Implementation Plan v6 (Final, Frozen)

**Продукт:** Aethel Launcher
**Организация / Бренд:** `Aethelis Projects` (Aethelis)
**Кодовое имя репозитория:** `bold-tesla` (техническое имя директории, не публичное имя)
**Целевая аудитория:** администраторы малых/средних приватных серверов Minecraft и игроки; сверхбыстрый, лёгкий, эстетичный, юридически чистый лаунчер; Microsoft- и офлайн/Yggdrasil-авторизация — равноправные фичи.
**Лицензия:** MIT / Apache-2.0, clean-room, без GPL-кода.
**Провенанс:** консолидация пяти итераций мульти-модельного ревью (Claude, GLM, Kimi, DeepSeek, GPT, Qwen). Отдельные правки не атрибутируются.

## 0. Правила исполнения документа (Governance)

1. **Документ заморожен.** Изменения — только через PR с воспроизводимой причиной: упавший тест, изменение внешнего API, обнаруженный факт исполнения. Ещё одно текстовое ревью — не причина для правки.
2. **Истина — исполнение.** Любое утверждение этого документа, конфликтующее с фактическим поведением JVM, Mojang/Modrinth API или ОС, проигрывает исполнению. Расхождение = баг-репорт + PR, не «код подгоняется под документ».
3. Числовые факты (хеши, векторы, лимиты) фиксируются в репозитории **только результатом исполнения программы**, никогда — текстом из ревью или документа.

---

## 🚨 КРИТИЧЕСКИЕ БЛОКЕРЫ

### Блокер #1: Тест-векторы Offline UUID — только через исполнение

Алгоритм: MD5 от UTF-8 байтов строки `"OfflinePlayer:<ник>"`, с фиксацией битов версии (3) и варианта (IETF/Leach-Salz) — эквивалент `java.util.UUID.nameUUIDFromBytes`. Не RFC-конструкция `new_v3(namespace, name)` — она даёт другие байты.

Значения из всех предыдущих итераций документа **не переносятся**: канал их происхождения не верифицируем, первая версия векторов уже была подделкой. Единственная фиксация — запуск генератора на реальной JVM:

```java
// tools/Gen.java — единственный источник истины для vectors.json
public class Gen {
    public static void main(String[] args) {
        String[] names = {"Steve", "Alex", "Notch", "Player", "Иван"};
        for (String n : names) {
            System.out.println("OfflinePlayer:" + n + " "
                + java.util.UUID.nameUUIDFromBytes(
                    ("OfflinePlayer:" + n).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        }
    }
}
```

Обязательные требования:
1. **Не-ASCII ник (`Иван`) обязателен.** Латиница не детектирует сломанную кодировку — а кириллические ники — ядро целевой аудитории.
2. Прогон на двух JDK (8 и любой современный) — вывод обязан совпасть; это инвариант «алгоритм не зависит от версии JDK», документируемый в provenance.
3. Формат `crates/aethel-auth/tests/vectors.json`:

```json
{
  "provenance": { "command": "javac tools/Gen.java && java -cp tools Gen", "jdk": ["Temurin 8", "Temurin 17"], "date": "…" },
  "vectors": [ { "input": "OfflinePlayer:Steve", "uuid": "<фактический вывод JVM>" } ]
}
```

4. **Правило расхождения:** упавший тест векторов означает: исполнить Gen.java, фактический вывод — истина, vectors.json обновляется только им (с обновлением provenance). «Чинить» генератор или алгоритм под вектор запрещено.
5. Лаунчер никогда не нормализует регистр ника до генерации UUID (`Steve ≠ steve`).
6. Стаб-идентичность M2 использует пару `Player` → UUID из vectors.json (к этому моменту уже зафиксированы в M0).

CI-страховка навсегда (падение = кто-то «поправил» векторы текстом):

```yaml
uuid-vectors:
  runs-on: ubuntu-latest
  strategy: { matrix: { java: [8, 17] } }
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with: { distribution: temurin, java-version: "${{ matrix.java }}" }
    - run: |
        javac tools/Gen.java && java -cp tools Gen > out.txt
        diff <(grep -v '^#' out.txt) <(python tools/vectors_to_txt.py)
```

### Блокер #2: Приватный ключ апдейтера

Приватный ключ подписи `tauri-plugin-updater` **никогда** не попадает в git, docs/, локальные файлы. Только CI-секреты. В `tauri.conf.json` и `docs/security.md` — только публичный ключ и процедура ротации. Контроль: `gitleaks` в CI + pre-commit hook. Ротация ключа после релиза ломает апдейты всех установленных копий — ключ это long-lived identity, генерируется в M0 один раз.

### Блокер #3: Бюрократия стартует в M0

- **Azure Application Registration** (Client ID для MS OAuth) — M3-блокирующая, заявка в M0, лидтайм до недель.
- **Apple Developer Program** ($99/год, notarization) и **Windows OV-сертификат** — заявки параллельно M0–M4, верификация занимает недели. Без нотаризации macOS-артефакт M6 Gatekeeper не откроет.

---

## ⚠️ Архитектурные правила

**1. Лестница длины командной строки (M1).** Полное дерево решений:

- **Ступень 1 — прямой спавн.** `std::process::Command` на Windows идёт через CreateProcessW (лимит ~32 767 символов, а не 8 191 у cmd.exe). Если итоговая строка влезает — всё напрямую.
- **Ступень 2 — env `CLASSPATH` (Windows, Java 8; также fallback-ветка).** Unicode в env передаётся нативно (UTF-16). Обязательное вырезание флага `-cp` и значения `${classpath}` из JVM-аргументов — иначе флаг перекрывает переменную.
- **Ступень 3 — `@argfile` (Java 9+).**
  - Java 18+: файл в UTF-8 (JEP 400).
  - Java 9–17, Windows: `GetShortPathNameW` для каждого пути; конвертация успешна (путь реально короче, только ASCII) → argfile в ASCII. Конвертация не удалась (8.3 отключён на томе `NtfsDisable8dot3NameCreation` — функция молча вернёт длинный путь!) → argfile в системной ACP-кодировке (encoding_rs, для ru-локали windows-1251). В путях есть символы вне ACP → откат на ступень 2 (CLASSPATH) даже для Java 9+.
  - Unix: argfile в UTF-8.
  - Экранирование: пробелы, кавычки, бэкслеши; тест на путь `C:\Игры\Aethel Launcher\`.
- **Ступень 4 — превышение env-блока (~32К):** `AppErrorCode::CLASSPATH_TOO_LONG` + человекочитаемая рекомендация (уменьшить число модов), не паника.

**2. Java-маппинг.** Первичный источник — `javaVersion.majorVersion` из version JSON (есть с 1.17+). Таблица-fallback для ≤1.16.5: ≤1.16.5→8, 1.17.x→16, 1.18–1.20.4→17, 1.20.5+→21. Модлоадеры могут требовать override выше (Forge).

**3. GC-пресеты и JEP 474 (M4).** ZGC — Java 15+. `-XX:+ZGenerational` — **только Java 21–22**. В JDK 23 генерационный режим — дефолт ZGC, а депрекейтнут *не*генерационный режим; на 23+ флаг не передавать вообще. Aikar's flags — серверные, для клиента адаптировать, не копировать.

**4. Хеши по источникам.** Mojang — только SHA-1. Modrinth (.mrpack, файлы) — SHA-1 + SHA-512. CurseForge — murmur2 (не крипто). В `aethel-core` с M0: `enum HashAlgorithm { Sha1, Sha512, Murmur2 }` — Murmur2 реализуется позже (CurseForge), но вариант enum существует сразу, чтобы не ломать сериализацию.

**5. Метаданные vs секреты.** SQLite (rusqlite, WAL, миграции `user_version`) — только метаданные: UUID, ники, тип аккаунта, кэш скинов, настройки. Токены (MS OAuth, XBL, XSTS) — только `keyring`; fallback на AES-GCM-файл там, где keyring нет (Steam Deck, Linux без libsecret). Ключ fallback: случайные 32 байта, генерируются при первом запуске, файл с правами 0600. Threat model честно в `docs/security.md`: защита от другого локального пользователя; от скомпрометированной ОС не защищает ничего (включая keyring).

**6. Платформенная матрица.** Правила OS: Windows x64, Linux x86_64, Linux aarch64, macOS x86_64, macOS arm64 — на статических фикстурах, не требуют реального железа. CI-джобы: `windows-latest` (x64), `ubuntu-latest` (x64), `ubuntu-24.04-arm` (aarch64, **test-only**; для приватного репо без arm-раннеров — `cargo-zigbuild` build-only), `macos-latest` (arm64) + `rustup target add x86_64-apple-darwin` (кросс Apple→Apple тривиален). **Артефакты v1:** Windows x64 (.msi/.exe), Linux x64 (AppImage + .deb), macOS universal (.dmg, `lipo`). linux-arm64 артефакта в v1 нет.

**7. OAuth.** Только системный браузер + loopback на случайном свободном порту; Device Code Flow — резерв. Встроенный webview запрещён (Microsoft блокирует). Refresh-логика обязательна: XBL/XSTS-токены короткоживущие.

**8. Authlib-Injector.** `-javaagent:authlib-injector.jar=<server_url>`. Jar не бандлится: скачивается с официальных релизов yushijinhun/authlib-injector, версия пинится, SHA-256 проверяется.

**9. События backend→frontend.** Единый неймспейс (`download:*`, `instance:*`, `process:*`, `auth:*`), каждое событие несёт `task_id`; прогресс/логи рейт-лимитированы до 15 Гц через `tokio::time::interval` + батчинг.

**10. Загрузчик.** Semaphore 4–6 соединений на хост; `.part`-файлы с докачкой; атомарный rename после валидации хеша; префлайт свободного места (`NO_DISK_SPACE`); защита от zip-slip/path traversal при любой распаковке (JRE, модпаки) — canonical-путь не выходит за целевую директорию.

**11. Процессы.** Закрытие лаунчера не осирочивает Java: Windows Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), Unix process groups (`setpgid`).

**12. i18n с M2.** i18next, ru+en, ноль захардкоженных строк (eslint-правило). Rust возвращает машиночитаемые `AppErrorCode`, локализация текста и рекомендаций — на фронте.

**13. Модлоадеры (M5).** Порядок: **Fabric → NeoForge → Quilt → Forge**. Forge — самый высокий риск (installer-метаданные); если к концу M5 нестабилен — переносится в v1.1 и не блокирует релиз. Легальный референс подхода — XMCL (MIT).

**14. Юридическая гигиена.** Prism (GPL-3.0) — только чтение логики, копирование/парафраз запрещён. XMCL (MIT) — свободный референс с атрибуцией. Ferium (MPL-2.0) — файловый copyleft, смотреть не копировать. Источники форматов — только официальные спеки. `cargo-deny` + license-checker в CI на каждый PR. Не рехостить файлы Mojang; брендинг без слова «Minecraft»; в README — «unofficial, compatible with Minecraft».

---

## 1. Non-Goals v1

- ❌ Версии старше 1.6 (legacy без asset index, LWJGL 2 — отдельная фаза после стабилизации 1.6+).
- ❌ CurseForge API (только Modrinth v2; CurseForge — v1.1).
- ❌ Modpack Studio (в v1 — установка/переключение модов, без визуального билдера).
- ❌ «120 FPS» как требование (замеримый критерий — бюджет кадра ≤16 мс, без jank).
- ❌ Мобильные ОС, хостинг серверов, сервер-браузер, контроллерный UI (Steam Deck — desktop mode).

## 2. Структура репозитория

```
aethel-launcher/
├── Cargo.toml                      # workspace: resolver = "2"
├── CONTRIBUTING.md                 # clean-room, запрет секретов в git
├── tools/
│   ├── Gen.java                    # генератор векторов UUID (блокер #1)
│   └── vectors_to_txt.py           # сверка vectors.json ↔ вывод Gen
├── crates/
│   ├── aethel-core/                # Instance, AppErrorCode, DTO, HashAlgorithm, BackendEvent
│   ├── aethel-manifest/            # Mojang v2, asset index, rules (5 платформ, фикстуры)
│   ├── aethel-download/            # Semaphore 4-6, SHA-1/512, .part, disk preflight, zip-slip guard
│   ├── aethel-java/                # Mojang runtime manifest + Adoptium v3 fallback, JEP 474
│   ├── aethel-auth/                # MS OAuth loopback/device-code, offline JDK-UUID, keyring+AES-GCM, authlib
│   ├── aethel-modding/             # Modrinth v2 (300 rpm, backoff, кэш 5 мин), Fabric→NeoForge→Quilt→Forge
│   ├── aethel-launch/              # classpath ladder, Job Objects / process groups, dry-run
│   ├── aethel-storage/             # SQLite rusqlite WAL, user_version (только метаданные)
│   └── aethel-tauri/               # обвязка Tauri v2, tauri-specta, рейт-лимит 15 Гц
├── src/                            # React 19 + TS + Tailwind
│   ├── components/                 # InstanceGrid, DownloadDrawer, LogViewer, Settings
│   ├── i18n/                       # ru.json, en.json
│   ├── store/                      # Zustand
│   └── bindings.ts                 # автоген tauri-specta
└── src-tauri/
    ├── capabilities/default.json
    └── tauri.conf.json             # публичный ключ апдейтера
```

Все крейты, кроме `aethel-tauri`, не зависят от Tauri — `cargo test` ядра в headless CI без webview.

## 3. Фазы M0–M6

**M0 — Фундамент, контракты, CI, бюрократия.**
- [ ] Cargo workspace (9 крейтов) + React 19/Vite/Tailwind.
- [ ] `tauri-plugin-single-instance`; ключевая пара updater: публичный → `tauri.conf.json`, приватный → CI-секреты; `gitleaks` + pre-commit.
- [ ] `tauri-specta` → `src/bindings.ts` **в первый день** (латать рассинхрон типов потом дороже).
- [ ] `aethel-core`: `Instance`, `AppErrorCode`, `BackendEvent`, `HashAlgorithm`.
- [ ] `aethel-storage`: rusqlite + WAL + миграции `user_version` + тест миграции.
- [ ] CI-матрица (п. 6): win-x64, linux-x64, linux-arm (test-only), macos-arm + cross x86_64; `cargo-deny`, license-checker, `npm audit`; clippy `-D warnings`; fmt.
- [ ] **Gen.java → запуск → vectors.json по фактическому выводу** (пре-шаг, блокер #1).
- [ ] CONTRIBUTING.md, docs/security.md (ротация ключей, AES-GCM threat model).
- [ ] Заявки: Azure, Apple Developer, Windows OV.
- **Выход:** пустое приложение собирается на всех таргетах, CI зелёный, vectors.json зафиксирован исполнением, заявки поданы.

**M1 — Ядро запуска.**
- [ ] `aethel-manifest`: парсинг `version_manifest_v2.json`, 1.6+–1.21+, правила на статических фикстурах (1.7.10, 1.12.2, 1.16.5, 1.20.4, 1.21.x) — Zero-Flaky, сеть из CI исключена.
- [ ] `aethel-download`: пул, `.part`, SHA-1/SHA-512 по источнику, диск-preflight, zip-slip guard.
- [ ] `aethel-launch`: classpath, `arguments.jvm` + `arguments.game`, `--gameDir`-изоляция; **полная лестница п. 1** (включая 8.3-проверку и ACP-ветку).
- [ ] Job Objects / process groups.
- [ ] CLI `--dry-run --json` → `LaunchReceipt`.
- **Выход:** зелёные тесты на фикстурах + dry-run ванильного клиента в CI.

**M2 — UI, i18n, стаб-идентичность.**
- [ ] i18next + ru/en, eslint-запрет хардкода; `AppErrorCode` → локализованные тексты с рекомендациями.
- [ ] События: `task_id`, 15 Гц, батчинг.
- [ ] UI: грид инстансов, Download Drawer, настройки RAM, виртуализированная лог-консоль; запуск со стаб-идентичностью `Player` + UUID из vectors.json.
- [ ] Vitest smoke с мок-IPC; **tauri-driver smoke: создание офлайн-профиля → dry-run** (WebdriverIO, non-required джоба).
- **Выход:** запуск ванильного Minecraft из UI со стаб-игроком.

**M3 — Авторизация.**
- [ ] Offline UUID: сверка с vectors.json (включая `Иван` и `Steve ≠ steve`).
- [ ] MS OAuth: системный браузер + loopback (случайный порт), Device Code Flow резерв; цепочка code→XBL→XSTS→Minecraft Services→профиль; refresh.
- [ ] Токены: keyring + AES-GCM fallback (ключ п. 5); в SQLite — только метаданные.
- [ ] Authlib-injector: пин версии + SHA-256.
- [ ] tauri-driver smoke: логин офлайн → dry-run с инжектом параметров.
- **Выход:** запуск под Microsoft-аккаунтом, офлайн-ником и через Ely.by.

**M4 — Java, JVM, Crash Analyzer.**
- [ ] `javaVersion.majorVersion` + fallback-таблица; Mojang JRE, fallback Adoptium v3; распаковка + `chmod +x`.
- [ ] GC-пресеты (G1GC адаптированный, ZGC 15+, GenZGC 21–22 по п. 3).
- [ ] Crash Analyzer: 5 фикстур (OOM, ClassNotFoundException, driver crash, Java version mismatch, corrupted jar) + mclo.gs.
- **Выход:** чистая машина без Java запускает игру; диагностика искусственно вызванного крэша.

**M5 — Моддинг.**
- [ ] Modrinth v2: 300 rpm, backoff, кэш 5 мин.
- [ ] Модлоадеры по порядку п. 13; Forge — с правом переноса в v1.1.
- [ ] Резолвер зависимостей (циклы, уже-установленное).
- [ ] `.jar ↔ .jar.disabled`.
- **Выход:** Fabric 1.20.4 + Sodium в один клик и запуск.

**M6 — Релизный контур.**
- [ ] Экспорт/импорт инстансов `.zip`, импорт `.mrpack`.
- [ ] Апдейтер: dry-run на тестовом манифесте; нотаризация и подпись (если сертификаты готовы).
- [ ] macOS universal: arm-раннер + cross + `lipo` → `.dmg`.
- [ ] Полный прогон перф-бюджетов и E2E; артефакты: `.msi`/`.exe`, `.AppImage`/`.deb` (x64), `.dmg` universal.
- **Выход:** релизные артефакты проходят все приёмочные тесты.

## 4. Verification Plan

**4.1 Автотесты ядра (headless, сеть выключена):**
1. UUID-векторы: сверка с vectors.json (Steve, Alex, Notch, Player, **Иван**), `Steve ≠ steve`; CI-джоба Gen.java на JDK 8 и 17 (блокер #1).
2. Аргументы: вырезание `-cp` при CLASSPATH-ветке; 500 фиктивных библиотек → Java 8 = env CLASSPATH, Java 17 = argfile (8.3/AAP-логика), Java 21 = UTF-8 argfile; пути с пробелами/кириллицей `C:\Игры\Aethel Launcher\`; `CLASSPATH_TOO_LONG`.
3. Zip-slip: отклонение `../`-путей.
4. Матрица правил: 5 платформ на фикстурах.
5. Токены: скан схемы SQLite — секретов в таблицах нет.
6. Crash Analyzer: 5 фикстур.
7. Миграции `user_version` без потери данных.

**4.2 Фронтенд (Vitest, ~90% тестов):** сторы Zustand; маппинг `AppErrorCode` → локализованные строки; виртуализация (рендер 1000 строк); мок IPC поверх tauri-specta bindings; `npm run build` strict, `no any`.

**4.3 Desktop E2E (tauri-driver + WebdriverIO):** smoke M2 (офлайн-профиль → dry-run), smoke M3 (логин → запуск). Одна джоба на ОС, non-required (не флакает релиз).

**4.4 Перф-бюджеты:** холодный старт < 2.0–2.5 с; грид 50 инстансов < 300 мс; 1000 модов, кадр ≤ 16 мс без jank; замеры `performance.mark` в dev-профиле.

**4.5 Ручная верификация:** `cargo tauri dev`; реальный MSA-логин в системном браузере; single-instance — второй запуск фокусирует окно; Steam Deck (desktop mode) smoke.

**4.6 CI-контур:** матрица п. 6; cargo-deny (licenses + advisories); license-checker + npm audit; gitleaks + pre-commit; Gen.java-джоба; clippy/fmt; все тесты без сети.

## 5. Старт M0 — 

- **1:** организация GitHub → репо → workspace 9 крейтов → Tauri v2 + single-instance → ключи updater (публичный в конфиг, приватный в Secrets) → первый коммит.
- **2:** `aethel-core` типы → tauri-specta → `aethel-storage` WAL → CI-матрица + cargo-deny + license-checker + gitleaks.
- **3:** **Gen.java → исполнение → vectors.json** → CONTRIBUTING.md → docs/security.md → заявки Azure / Apple / OV.

## 6. Правило для агентов (одной строкой)

Истина — исполнение, не текст; код с нуля по официальным спецификациям, открытые лаунчеры — только чтение edge-cases; обе ветки авторизации равноправны, OAuth — только системный браузер; ядро не зависит от Tauri; токены не в SQLite; приватный ключ не в git; слово «Minecraft» не в брендинге.

---

Документ заморожен — правки только через CI-факты. Следующий артефакт по желанию: брифы агентов на M0–M1 (границы задач, DoD, первые tauri-specta команды, CI-джоба Gen.java как первое звено, стык `aethel-core ↔ storage ↔ tauri`).
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-09-04T00:30:21+03:00.
</ADDITIONAL_METADATA>