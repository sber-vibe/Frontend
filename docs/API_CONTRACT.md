# Контракт API для рабочего места (кейс 3 «Агентство инноваций»)

Фронтенд ходит только в `/api/v1` backend и **ничего не решает сам**: тип документа, поля, комплектность,
правила, итог по файлу и пакету приходят с сервера. Ниже — то, что фронт уже умеет показывать.

Совместимость: все новые поля необязательны. Если backend их не отдаёт, интерфейс работает в режиме текущей заготовки.
Если нового маршрута ещё нет (`404 No static resource …`, `405`, `501`), фронт показывает понятное
«сервер пока не поддерживает …» вместо ошибки. Типы — в [`src/lib/types.ts`](../src/lib/types.ts).

Ошибки — [Problem Details](https://www.rfc-editor.org/rfc/rfc9457): поле `detail` показывается специалисту,
поэтому оно должно быть понятным по-русски (или добавьте перевод в `DETAIL_TRANSLATIONS` в `src/lib/api.ts`).
Технические коды (`code` замечания) специалисту не показываются.

## Типы документов

| Код | Документ |
|---|---|
| `APPLICATION` | Заявление на субсидию |
| `PD_CONSENT` | Согласие на обработку персональных данных |
| `CONFORMITY_CERTIFICATE` | Сертификат соответствия |
| `PROJECT_PRESENTATION` | Презентация проекта |
| `COST_JUSTIFICATION` | Обоснование затрат |
| `BANK_STATEMENT` | Выписка из банка |
| `REAL_ESTATE_DOCUMENT` | Документ на недвижимое имущество |
| `GUARANTEE_LETTER` | Гарантийное письмо |
| `GIMS_DECLARATION` | Декларация ГИМС (условный документ «Обустройства пляжа») |
| `UNKNOWN` или `null` | Тип не определён — требуется проверка специалиста |

Неизвестный код показывается как есть, поэтому новый вид документа добавляется без правки фронта.

Имена полей, для которых есть русские подписи (`src/lib/documentTypes.ts`): `company_name`, `inn`, `ogrn`,
`requested_amount`, `date`, `signatory`, `full_name`, `passport`, `certificate_number`, `certification_body`,
`issue_date`, `valid_until`, `project_name`, `summary`, `total_expenses`, `own_funds`, `expense_items`,
`account_number`, `balance`, `cadastral_number`, `area`, `purpose`, `address`, `guarantor`, `amount`.
Поля с суммой и датой форматируются при показе (`850 000 ₽`, `07.10.2026`).

## Заявки

### `GET /programs` → `Program[]`

Программы для выбора при создании заявки. Маршрут обязателен: без него заявку создать нельзя.

```json
{ "code": "INNOVATION", "name": "Инновационный проект", "active": true,
  "documents": [
    { "type": "APPLICATION", "requirement": "REQUIRED" },
    { "type": "CONFORMITY_CERTIFICATE", "requirement": "CONDITIONAL", "condition": "если продукция подлежит сертификации" } ] }
```

### `POST /applications`

```json
{ "programCode": "INNOVATION" }
```

Специалист вводит **только программу** (`null` — определить из заявления). Организацию, ИНН, проект и сумму
сервер извлекает из документов пакета и заполняет карточку заявки. Ручной ввод реквизитов при создании не
заменяет извлечение: арифметические проверки выполняются на извлечённых числах.

### `ApplicationView` — реквизиты из документов

`applicantName`, `inn`, `projectName`, `requestedAmount` — `null`, пока не извлечены или не распознаны.

`requisites[]` — реквизиты карточки с источником (`ExtractedField` + `documentId`):

```json
[ { "name": "company_name", "value": "ООО «Ромашка»", "status": "RECOGNIZED", "documentId": "d1",
    "source": "Заявитель: ООО «Ромашка»", "confidence": 0.93 },
  { "name": "inn", "value": null, "status": "NOT_RECOGNIZED", "documentId": "d1" },
  { "name": "requested_amount", "value": 900000, "status": "RECOGNIZED", "documentId": "d1",
    "manuallyCorrected": true, "originalValue": 850000, "correctedBy": "Анна Петрова",
    "correctedAt": "2026-10-10T09:00:00Z" } ]
```

Имена: `company_name`, `inn`, `project_name`, `requested_amount` (+ любые дополнительные, например `kpp`).
Пока файлы обрабатываются, фронт пишет «Извлекается из документов…»; после обработки пустое значение или
`status: "NOT_RECOGNIZED"` показывается как **«Не распознано / требуется проверка»** и не считается извлечённым.

### `ApplicationView` — новые поля

| Поле | Назначение |
|---|---|
| `programCode`, `programName` | Программа субсидии |
| `programDetected` | `true`, если программа определена из заявления |
| `decision` | Решение специалиста `{ decision: "ACCEPTED" \| "RETURNED" \| "REJECTED", comment, decidedBy, decidedAt }` |
| `duplicateOf` | id заявки, где уже проверялся такой же пакет, — показывается предупреждение со ссылкой |

### `POST /applications/{id}/decision` → `ApplicationView`

```json
{ "decision": "RETURNED", "comment": "Дослать согласие на обработку ПД" }
```

Для `RETURNED` и `REJECTED` фронт требует комментарий. Сервер сохраняет автора из JWT и пишет запись в журнал.

## Документы и фоновая обработка

`POST /applications/{id}/documents` (multipart, `file`, `type` необязателен) должен **сразу** вернуть `201`
с `processingStatus: "UPLOADED"`. Дальше сервер обрабатывает файл в фоне, а фронт каждые 2 с
(`NEXT_PUBLIC_POLL_INTERVAL_MS`) перечитывает `GET /applications/{id}`, пока есть файлы не в `DONE`/`FAILED`
или `report.status = "PROCESSING"`.

### `DocumentView` — новые поля

| Поле | Значения | Как показывается |
|---|---|---|
| `processingStatus` | `UPLOADED`, `PENDING` → `CLASSIFYING`, `EXTRACTING`, `CHECKING`, `PROCESSING` → `DONE` / `FAILED` | шкала «Принят → Определяется → Проверен» |
| `processingError` | текст | причина ошибки и кнопка «Повторить обработку» |
| `detectedType`, `confidence` | тип от модели, 0..1 | ниже `NEXT_PUBLIC_CONFIDENCE_THRESHOLD` — «требует подтверждения» |
| `typeSource` | `MODEL` / `SPECIALIST` | «Определено моделью» или «Тип указан специалистом …» |
| `typeChangedBy`, `typeChangedAt` | автор и время ручной правки | рядом с типом |
| `outcome` | `PASSED` / `ATTENTION` / `ERRORS` | итог по файлу в списке документов |
| `fields[]` | `{ name, value, status, confidence, source, manuallyCorrected, originalValue, correctedBy, correctedAt }` | `source` — фрагмент текста; `NOT_RECOGNIZED` или пустое `value` — «Не распознано / требуется проверка»; при правке — история «распознано моделью: … · исправил …» |

### `PATCH /applications/{id}/documents/{documentId}` → `DocumentView`

`{ "type": "GUARANTEE_LETTER" }` или `{ "fields": [{ "name": "inn", "value": "6161234567" }] }`.
Сервер ставит `typeSource: "SPECIALIST"`, пересчитывает проверку и пишет журнал.
При правке поля сервер сохраняет исходное значение модели в `originalValue` (не перезаписывает его при
повторных правках), ставит `manuallyCorrected: true`, `status: "RECOGNIZED"`, `correctedBy` из JWT и `correctedAt`,
обновляет соответствующий реквизит в `requisites[]` и пишет `FIELD_CHANGED` в журнал.

### `GET /applications/{id}/documents/{documentId}/preview`

Версия DOC/DOCX/XLS/XLSX для просмотра рядом с результатом (PDF и сканы фронт показывает сам).

| Ответ | Что показывает фронт |
|---|---|
| `200`, `application/pdf` или `text/html` | версию для просмотра (HTML — в изолированном фрейме без скриптов) |
| `202` + `Retry-After: <сек>` | «Сервер готовит версию для просмотра…», повторяет запрос (до 20 раз) |
| `404`/`405`/`501` без Problem Details | «Сервер пока не формирует версию этого формата» |
| другая ошибка (`422` и т. п.) | «Не удалось подготовить документ для просмотра: `detail`» |

Во всех случаях оригинал доступен для скачивания.

### `POST /applications/{id}/documents/{documentId}/reprocess` → `DocumentView`

Повторить обработку моделью после `FAILED` (модель недоступна, таймаут, ответ не по схеме).

### Честные статусы

- Документ без `processingStatus` фронт показывает как «Нет результата обработки», а не «проверен».
- Зелёная отметка файла — только при `outcome: "PASSED"`; отсутствие замечаний успехом не считается.
- Отчёт `PASSED` показывается как «Результат неполный», если есть файлы без `DONE`, с `FAILED` или с неопределённым типом.

### Исправление типа

Только `PATCH`: при ошибке фронт ничего не перезагружает и не удаляет. Документ сохраняет `id` и оригинал.

## Отчёт проверки

`CheckReport.status`: `PASSED` (пройдено) / `ATTENTION` (требует внимания) / `ERRORS` (есть ошибки) /
`PROCESSING` (идёт). Старые `INCOMPLETE` и `REVIEW_REQUIRED` тоже понимаются.

`findings[]`: `{ code, message, severity: "ERROR" | "WARNING" | "INFO" | "OK", documentType, documentId, rule, field }`.
`message` показывается специалисту как есть. `OK` — пройденные проверки. Коды, которые фронт дополнительно
узнаёт для сводок: `DOCUMENT_EXPIRES_SOON`, `DOCUMENT_EXPIRED` (блок «Сроки документов» на дашборде).

`completeness[]` — комплектность по перечню программы, считает сервер:

```json
[ { "type": "APPLICATION", "status": "FOUND", "requirement": "REQUIRED", "documentIds": ["d1"] },
  { "type": "PD_CONSENT", "status": "MISSING", "requirement": "REQUIRED", "canUpload": true },
  { "type": "CONFORMITY_CERTIFICATE", "status": "CONDITIONAL_MISSING", "requirement": "CONDITIONAL",
    "condition": "если продукция подлежит сертификации" },
  { "type": "GIMS_DECLARATION", "status": "EXTRA", "requirement": "EXTRA", "documentIds": ["d7"] } ]
```

Без `completeness` фронт строит список из `GET /document-types` и замечаний `MISSING_DOCUMENT` /
`CONDITIONAL_DOCUMENT_MISSING`.

## Журнал

`GET /applications/{id}/journal` и `GET /admin/journal?limit=200` → `JournalEntry[]`:

```json
{ "id": "…", "at": "2026-10-10T09:02:00Z", "actor": "gigachat", "actorType": "SYSTEM",
  "action": "PROCESSING_FAILED", "message": "7.pdf не обработан", "outcome": "FAILED",
  "reason": "Модель не ответила за 60 секунд", "applicationId": "…", "documentId": "…" }
```

`actorType`: `SYSTEM` / `SPECIALIST` / `ADMIN`. Подписи действий — `src/components/journal/JournalList.tsx`
(`APPLICATION_CREATED`, `DOCUMENT_UPLOADED`, `DOCUMENT_CLASSIFIED`, `FIELDS_EXTRACTED`, `DOCUMENT_TYPE_CHANGED`,
`FIELD_CHANGED`, `PROCESSING_FAILED`, `MODEL_CALL`, `CHECK_COMPLETED`, `DECISION_MADE`, `PROGRAM_CHANGED`,
`RULE_CHANGED`, `ACCESS_DENIED`); неизвестное действие показывается как есть.

## Администрирование (роль `admin`)

| Метод | Путь | Тело / ответ |
|---|---|---|
| GET | `/admin/programs` | `Program[]` (включая неактивные) |
| POST | `/admin/programs` | `Program` → созданная `Program` |
| PUT | `/admin/programs/{code}` | `Program` → сохранённая `Program` |
| GET | `/admin/rules` | `Rule[]` |
| PUT | `/admin/rules/{code}` | `Rule` → сохранённое `Rule` |

```json
{ "code": "OWN_FUNDS_SHARE", "name": "Доля собственных средств", "enabled": true, "severity": "ERROR",
  "documentTypes": ["COST_JUSTIFICATION"], "params": { "minOwnFundsShare": 0.5 } }
```

`params` — произвольные пары ключ/значение (число, строка, булево). Фронт рисует поле по типу значения;
русские подписи известных ключей — `PARAM_LABELS` в `src/components/admin/RulesEditor.tsx`.

## Программы

Без `GET /programs` (или без активных программ) фронт не даёт создать заявку и предлагает повторить запрос:
автоопределение программы предлагается, только когда перечень программ получен.

## Авторизация

Фронт отправляет `Authorization: Bearer <access token>` Keycloak. Роли берутся из `realm_access.roles`
(`specialist`, `admin`) **только для показа интерфейса**: доступ к API и к файлам проверяет backend.

На любой `401` фронт завершает сессию Keycloak и отправляет на вход с возвратом на ту же страницу
(«Сессия истекла… последнее действие не было выполнено»). Опрос заявки при `401`/`403` прекращается,
при сетевых ошибках повторяется с нарастающим интервалом и после 5 неудач останавливается до ручного «Обновить».
